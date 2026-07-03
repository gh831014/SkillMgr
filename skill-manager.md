# Skill管理生成工具 (Skill Manager) 阿里云部署与代码架构说明书

本工作台是一个基于 **Express (Node.js) + React (Vite) + Tailwind CSS** 的全栈一体化系统。为了让您在阿里云 Nginx 环境下顺利部署，并成功配置默认大模型（DeepSeek V4 Pro），本文档将为您提供从底层依赖、适配修改、Nginx 反向代理配置到 SQLite 数据维护的完整实操指南。

---

## 一、 系统架构与依赖组件说明

### 1. 核心技术栈
* **前端 (Frontend)**：React 19 + Vite 6 + Tailwind CSS 4 + Lucide Icons (图标) + Motion (动画效果)。
* **后端 (Backend)**：Express 4 + ESBuild (打包编译工具) + Node-Fetch。
* **数据库 (Database)**：**SQLite (通过 `better-sqlite3` 驱动)**。

### 2. 外部组件与依赖说明
* **SQLite 嵌入式数据库**：
  * **零配置、零维护**：本系统所有的 Skill 数据、分类树（Taxonomy）和 LLM 参数配置，全部持久化在项目根目录下的 `data/skills.db` 单个文件中。
  * **无需安装外部 MySQL/PostgreSQL/Redis 服务**：系统在首次启动时，会自动在 `data/skills.db` 中建表，并导入初始的 Preset 预设分类与默认示例，您无需在阿里云上额外创建和配置数据库实例。
  * **与其他软件同类组件的复用/隔离**：
    * **隔离性**：如果您的阿里云服务器上还运行了其他使用 MySQL 或 PostgreSQL 的业务系统，本软件**完全不会**与它们产生端口冲突或资源抢占。
    * **复用性与数据共享**：不建议多个不同的应用直接通过操作系统文件锁去并发读写同一个 `.db` 文件。如果您想在其他系统复用本工作台的 Skill 数据，**推荐通过本系统提供的 RESTful 接口（如 `GET /api/skills`）进行跨系统数据获取与同步**，这是最安全、最符合现代微服务规范的复用方式。
* **外网访问依赖 (AI 接口)**：
  * 系统自身不需要复杂的外部组件，但由于它需要直接请求 DeepSeek / Google Gemini 的官方 API，因此**部署本系统的阿里云 ECS 服务器必须具备外网访问权限（能够畅通解析并请求 HTTPS 外网域名）**。

---

## 二、 部署前的系统适配修改（子路径部署适配）

由于您计划将系统部署在域名下的子路径 `pmlaogao.com/skill-manager/`，而非主域名根目录下，需要对工程进行针对性的子路径路径适配。请在打包部署前完成以下两个步骤的修改：

### 1. 修改前端构建基准路径 (`vite.config.ts`)
打开根目录下的 `vite.config.ts`，在导出的配置对象中加入 `base: '/skill-manager/'`。这样在执行 `npm run build` 时，生成的 HTML 引入静态资源（JS/CSS）的路径会自动带有 `/skill-manager/` 前缀。

**修改示例：**
```typescript
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: '/skill-manager/', // 👈 新增此行，适配阿里云子路径部署
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
```

---

## 三、 阿里云 Nginx 配置指南

本系统是全栈项目，后端 Express 不仅提供数据 API，还要提供 SQLite 读写服务并托管打包好的静态资源。因此，在阿里云 Nginx 的配置中，我们将**使用 Nginx 将 `/skill-manager/` 路径的所有流量反向代理到 Node.js 进程（假设运行在本地的 `3000` 端口）**。

### 1. Nginx 虚拟主机配置文件
在您的阿里云 Nginx 配置目录（通常为 `/etc/nginx/conf.d/` 或 `/etc/nginx/nginx.conf`）中，找到监听 `pmlaogao.com` 的 `server` 块，添加如下反向代理配置：

```nginx
server {
    listen 80;
    listen 443 ssl; # 如果您配置了阿里云 SSL 证书
    server_name pmlaogao.com;

    # 主站或其他服务的配置...
    location / {
        root /usr/share/nginx/html;
        index index.html index.htm;
    }

    # =========================================================
    # Skill管理生成工具 (Skill Manager) 反向代理配置
    # =========================================================
    location /skill-manager/ {
        # 1. 将子路径请求代理到本地 Node.js 服务的 3000 端口
        # 注意：这里的 proxy_pass 结尾有斜杠 '/'，Nginx 会自动在转发时剥离掉 '/skill-manager/' 前缀
        proxy_pass http://127.0.0.1:3000/;

        # 2. 传递标准的客户端请求头
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 3. 增加超时时间，防止 AI 接口生成耗时较长时触发 Nginx 504 Gateway Timeout
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        
        # 4. 支持大文件/大数据传输
        client_max_body_size 50m;
    }
}
```

---

## 四、 默认大模型配置指导（DeepSeek V4 Pro）

本系统默认支持 **DeepSeek** 和 **Google Gemini** 双引擎，并支持运行时可视化热切换。为了满足您将默认模型设置为 **DeepSeek V4 Pro** 的需求，您可以采用以下两种方式之一完成配置：

### 1. 方法 A：通过前端页面可视化配置（推荐，极简）
1. 成功部署并访问系统后，点击右上角的 **「模型配置」** 按钮。
2. 在弹出的配置面板中：
   * **当前大模型提供商**：选择 **DeepSeek**。
   * **DeepSeek API Key**：输入您在 DeepSeek 官方或阿里云百炼/ModelScope 平台获取的 API 密钥（格式通常为 `sk-...`）。
   * **API Base URL**：填写接口基地址，官方默认为 `https://api.deepseek.com/v1`。
   * **Model Name (模型标识码)**：输入您的专属模型版本代码（例如，官方标准版填 `deepseek-chat`；若使用的是特定厂商渠道的高性能版，如 DeepSeek V3/V4，按对应名称填写）。
3. 点击 **「保存配置」**。系统会将上述凭证安全地保存至服务器本地的 SQLite 数据库 `settings` 表中，**立即生效，且重启服务也不会丢失**。

### 2. 方法 B：通过环境变量 `.env` 进行服务器端全局预设
如果您希望系统在首次部署、尚未进入页面配置前就默认使用 DeepSeek，您可以在服务器的代码根目录下创建一个 `.env` 文件：

```env
# /usr/share/nginx/html/skill-manager/.env

# 默认激活的大模型提供商
LLM_PROVIDER="deepseek"

# 默认的 DeepSeek API Key 凭证 (请替换为您的真实密钥)
DEEPSEEK_API_KEY="sk-xxxxxxxxxxxxxx"

# 默认的 DeepSeek API 终端入口
DEEPSEEK_BASE_URL="https://api.deepseek.com/v1"

# 默认的 DeepSeek 模型名称 (例如 deepseek-chat 即 DeepSeek-V3/V4 统一对话标识)
DEEPSEEK_MODEL="deepseek-chat"
```
*提示：系统在启动时会首先读取 `.env` 配置文件中的变量。如果用户未在界面上手动保存过模型设置，系统将直接以此作为出厂默认值进行 AI 生成、质检、微调和测试。*

---

## 五、 阿里云部署实操全步骤

以下是针对阿里云 ECS Linux (CentOS/Ubuntu/Debian) 环境的保姆级安装部署指南。

### 步骤 1：在阿里云服务器上安装 Node.js 与 PM2
由于后端采用 Node.js (TypeScript) 运行，您需要安装 Node.js 运行时环境（推荐 **Node.js v18 或 v20**）以及进程守护工具 `PM2`。

```bash
# 1. 使用 NodeSource 安装 Node.js v20 (以 Ubuntu/Debian 为例)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node -v
npm -v

# 2. 全局安装 PM2 进程管理器，用于后台守护 Node.js 服务
sudo npm install -g pm2
```

### 步骤 2：创建目标部署目录并同步代码
1. 创建对应英文名称的部署目录 `/usr/share/nginx/html/skill-manager`：
   ```bash
   sudo mkdir -p /usr/share/nginx/html/skill-manager
   # 将目录所有权赋予当前部署用户（例如 ubuntu 或 root）
   sudo chown -R $USER:$USER /usr/share/nginx/html/skill-manager
   ```
2. 将本地打包好的项目代码（或通过 Git 仓库、Zip 包、阿里云 Codeup、FTP 工具等）同步到该目录下。
   * **注意**：必须同步以下关键文件：`package.json`、`server.ts`、`vite.config.ts`、`index.html`、`src/` 整个目录。不需要同步本地的 `node_modules` 目录，需在服务器端纯净安装。

### 步骤 3：在服务器端安装依赖与执行编译
1. 进入项目根目录：
   ```bash
   cd /usr/share/nginx/html/skill-manager
   ```
2. 安装环境所需的全部 Node 模块依赖：
   ```bash
   npm install
   ```
   * *注：由于 `better-sqlite3` 是原生 C++ 绑定库，安装时它会自动在您的阿里云服务器上尝试本地编译。如果安装过程中报错，通常是由于服务器缺少 GCC/G++ 编译器，执行 `sudo apt-get install -y build-essential` (Ubuntu) 或 `sudo yum groupinstall "Development Tools"` (CentOS) 补齐编译环境后重试即可。*

3. 执行构建。这会启动 Vite 编译前端单页应用（输出至 `dist/` 目录），并启动 ESBuild 将后端的 `server.ts` 打包成兼容生产环境运行的 `dist/server.cjs`：
   ```bash
   npm run build
   ```

### 步骤 4：通过 PM2 启动后端服务
利用 PM2 进程管理器启动应用，并将其设置为开机自动启动，确保服务高可用：

```bash
# 1. 使用 PM2 启动服务（启动命令指向 package.json 中配置好的 npm run start）
pm2 start npm --name "skill-manager" -- start

# 2. 查看服务运行状态
pm2 list

# 3. 设置 PM2 开机自启
pm2 save
pm2 startup
```
*此时，您的后端 Express 已经在服务器本地的 `http://127.0.0.1:3000` 端口上稳定运行，并自动在根目录下创建了持久化的本地 SQLite 数据库文件 `data/skills.db`。*

### 步骤 5：配置与重启 Nginx
1. 将上文 **「三、 阿里云 Nginx 配置指南」** 中的 location 块配置写入您的 Nginx 站点配置文件中。
2. 验证 Nginx 配置文件是否有语法错误：
   ```bash
   sudo nginx -t
   ```
3. 重启或热重载 Nginx 服务使其配置生效：
   ```bash
   sudo systemctl reload nginx
   ```

---

## 六、 部署成功验证
1. 打开浏览器，访问您的公域域名：`https://pmlaogao.com/skill-manager/` (请根据实际是否配置了 SSL 选择 http/https)。
2. 您应当能正常看到 **「Skill管理生成工具」** 精美的工作台界面，内置的数据是由系统在 SQLite 中为您自动初始化的演示数据。
3. 点击右上角 **「模型配置」**，配置您的 DeepSeek API Key，保存后点击 **「AI 自动生成 Skill」**。如果接口能够顺畅吐出新生成的 Skill 内容，恭喜您，阿里云生产环境全线部署大功告成！

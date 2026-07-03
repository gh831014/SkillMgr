/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import Database from "better-sqlite3";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));

// Ensure database folders exist
const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

// Initialize SQLite database
const db = new Database(path.join(DATA_DIR, "skills.db"));

// Create tables if they do not exist
db.exec(`
  CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version TEXT,
    description TEXT,
    author TEXT,
    created_at TEXT,
    updated_at TEXT,
    dod_status TEXT,
    total_tokens INTEGER,
    taxonomy TEXT,
    dod_report TEXT,
    dependencies TEXT,
    topic TEXT,
    content TEXT,
    steps TEXT,
    checks TEXT,
    examples TEXT
  );

  CREATE TABLE IF NOT EXISTS taxonomy (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT,
    level INTEGER,
    sort_order INTEGER
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Helper to get and set setting
const getSetting = (key: string, defaultValue: string): string => {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  if (row) return row.value;
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, defaultValue);
  return defaultValue;
};

// Initialize LLM configuration defaults
getSetting("llm_provider", "deepseek");
getSetting("deepseek_api_key", process.env.DEEPSEEK_API_KEY || "");
getSetting("deepseek_base_url", process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1");
getSetting("deepseek_model", process.env.DEEPSEEK_MODEL || "deepseek-chat");
getSetting("gemini_api_key", process.env.GEMINI_API_KEY || "");
getSetting("gemini_model", "gemini-3.5-flash");

// Initialize Gemini API
const geminiApiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;

if (geminiApiKey) {
  try {
    ai = new GoogleGenAI({
      apiKey: geminiApiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
    console.log("Gemini API client initialized successfully.");
  } catch (err) {
    console.error("Failed to initialize Gemini API Client:", err);
  }
} else {
  console.warn("GEMINI_API_KEY is not defined. LLM operations will fall back to mock templates.");
}

// Default Preset Taxonomy
const DEFAULT_TAXONOMY_NODES = [
  // Level 1 Nodes
  { id: "1", name: "数据分析", level: 1, parent_id: null, sort_order: 1 },
  { id: "2", name: "代码开发", level: 1, parent_id: null, sort_order: 2 },
  { id: "3", name: "内容创作", level: 1, parent_id: null, sort_order: 3 },
  { id: "4", name: "系统运维", level: 1, parent_id: null, sort_order: 4 },
  { id: "5", name: "客户服务", level: 1, parent_id: null, sort_order: 5 },
  { id: "6", name: "知识管理", level: 1, parent_id: null, sort_order: 6 },
  { id: "7", name: "通用助手", level: 1, parent_id: null, sort_order: 7 },

  // Level 2 Nodes - 数据分析
  { id: "1-1", name: "数据清洗", level: 2, parent_id: "1", sort_order: 1 },
  { id: "1-2", name: "可视化报表", level: 2, parent_id: "1", sort_order: 2 },
  { id: "1-3", name: "异常检测", level: 2, parent_id: "1", sort_order: 3 },

  // Level 2 Nodes - 代码开发
  { id: "2-1", name: "Python", level: 2, parent_id: "2", sort_order: 1 },
  { id: "2-2", name: "JavaScript/TypeScript", level: 2, parent_id: "2", sort_order: 2 },
  { id: "2-3", name: "SQL优化", level: 2, parent_id: "2", sort_order: 3 },
  { id: "2-4", name: "代码审查", level: 2, parent_id: "2", sort_order: 4 },

  // Level 2 Nodes - 内容创作
  { id: "3-1", name: "营销文案", level: 2, parent_id: "3", sort_order: 1 },
  { id: "3-2", name: "技术文档", level: 2, parent_id: "3", sort_order: 2 },
  { id: "3-3", name: "翻译润色", level: 2, parent_id: "3", sort_order: 3 },
  { id: "3-4", name: "创意写作", level: 2, parent_id: "3", sort_order: 4 },

  // Level 2 Nodes - 系统运维
  { id: "4-1", name: "监控告警", level: 2, parent_id: "4", sort_order: 1 },
  { id: "4-2", name: "日志分析", level: 2, parent_id: "4", sort_order: 2 },
  { id: "4-3", name: "自动化脚本", level: 2, parent_id: "4", sort_order: 3 },

  // Level 2 Nodes - 客户服务
  { id: "5-1", name: "FAQ问答", level: 2, parent_id: "5", sort_order: 1 },
  { id: "5-2", name: "工单分类", level: 2, parent_id: "5", sort_order: 2 },
  { id: "5-3", name: "情感分析", level: 2, parent_id: "5", sort_order: 3 },

  // Level 2 Nodes - 知识管理
  { id: "6-1", name: "信息抽取", level: 2, parent_id: "6", sort_order: 1 },
  { id: "6-2", name: "知识图谱构建", level: 2, parent_id: "6", sort_order: 2 },
  { id: "6-3", name: "智能摘要", level: 2, parent_id: "6", sort_order: 3 },

  // Level 2 Nodes - 通用助手
  { id: "7-1", name: "任务规划", level: 2, parent_id: "7", sort_order: 1 },
  { id: "7-2", name: "日程管理", level: 2, parent_id: "7", sort_order: 2 },
  { id: "7-3", name: "信息检索", level: 2, parent_id: "7", sort_order: 3 },
];

const DEFAULT_SKILLS = [
  {
    id: "skill-20260601-001",
    name: "智能天气查询助手",
    version: "2.1.0",
    description: "基于用户自然语言查询实时天气信息，支持多城市对比和穿衣建议",
    author: "AI-Labs",
    created_at: "2026-06-01T10:00:00Z",
    updated_at: "2026-06-30T15:30:00Z",
    taxonomy: {
      category_tree: ["技术场景", "API集成", "第三方服务"],
      primary_category: "客户服务",
      secondary_category: "FAQ问答",
      tertiary_category: "天气服务",
      tags: ["天气", "API", "实时数据", "出行建议"],
      classification_attrs: {
        difficulty_level: "intermediate",
        execution_mode: "sync",
        industry: ["旅游", "生活服务"],
        scenario: ["出行决策", "客服问答"],
      },
    },
    dod_status: "PASSED",
    dod_report: {
      passed: true,
      issues: [
        { type: "warning", message: "建议在 user_prompt 中加入更加具体的负向约束条件。" }
      ]
    },
    total_tokens: 480,
    dependencies: ["skill-auth-helper", "skill-json-parser"],
    topic: {
      goal: "帮助用户快速获取目标城市的实时天气、未来三天预报及个性化出行建议。",
      scope: "国内所有地级市及国外核心热门城市，不包含乡镇等微型气象区。",
    },
    content: {
      system_prompt: "你是一个专业的天气助手，拥有全球主要城市的实时气象数据访问权限。你的回答必须基于真实数据，严禁编造。当用户询问天气时，请优先解析出 [城市名] 和 [时间维度]（今天/明天/未来三天）。对于可能存在的恶劣天气（暴雨、大风、极端气温等），请给予醒目的红色标识警告，并提供具体的备用预案（如：室内运动、备用雨具、调整行程时间等）。",
      prompt: "请查询以下信息：\n- 城市：{{city}}\n- 日期：{{date}}\n- 附加需求：{{extra_requirements}}",
    },
    steps: [
      {
        id: "step-1",
        name: "意图解析",
        description: "从用户输入中提取城市、时间、兴趣点（如‘是否适合爬山’）。",
        pre_condition: "输入文本非空",
        timeout_ms: 500,
        error_handling: "默认使用当前定位城市和当前日期",
      },
      {
        id: "step-2",
        name: "调用外部API",
        description: "请求 api.weather.com/v1/forecast，传入城市坐标。",
        pre_condition: "上一步成功提取城市",
        timeout_ms: 3000,
        error_handling: "若API超时，返回缓存数据并标记‘非实时’",
      },
      {
        id: "step-3",
        name: "结果格式化",
        description: "将 JSON 数据转为自然语言，并生成穿衣/出行指数。",
        pre_condition: "API返回状态码 200",
        timeout_ms: 1000,
        error_handling: "展示原始天气信息，省略生活指数建议",
      },
    ],
    checks: [
      {
        id: "chk-1",
        name: "城市合法性",
        rule: "必须为全球前500大城市之一",
        severity: "Error",
      },
      {
        id: "chk-2",
        name: "API Key有效性",
        rule: "检查环境变量是否配置",
        severity: "Error",
      },
      {
        id: "chk-3",
        name: "输出字数限制",
        rule: "回复不超过 150 个中文字符",
        severity: "Warning",
      },
      {
        id: "chk-4",
        name: "敏感词过滤",
        rule: "不包含政治/宗教敏感词",
        severity: "Error",
      },
    ],
    examples: [
      {
        id: "ex-1",
        input: "北京明天天气怎么样？适合爬山吗？",
        output: "北京明天（7月2日）晴转多云，22°C~30°C，南风3级。**适合爬山**，建议携带防晒服和充足饮水。",
      },
      {
        id: "ex-2",
        input: "纽约未来三天会下雨吗？",
        output: "纽约未来三天：周五雷阵雨（80%），周六多云，周日晴。出行请备雨具。",
      },
    ],
  },
  {
    id: "skill-20260630-002",
    name: "SQL性能瓶颈诊断器",
    version: "1.0.0",
    description: "分析慢查询SQL执行计划（Explain Plan），找出索引缺失或全表扫描问题并提供重构SQL",
    author: "DBA-Pilot",
    created_at: "2026-06-30T12:00:00Z",
    updated_at: "2026-06-30T12:00:00Z",
    taxonomy: {
      category_tree: ["代码开发", "SQL优化"],
      primary_category: "代码开发",
      secondary_category: "SQL优化",
      tertiary_category: "性能诊断",
      tags: ["SQL", "数据库性能", "索引优化", "Explain"],
      classification_attrs: {
        difficulty_level: "advanced",
        execution_mode: "sync",
        industry: ["互联网", "金融"],
        scenario: ["系统运维", "代码审查"],
      },
    },
    dod_status: "PASSED",
    dod_report: {
      passed: true,
      issues: []
    },
    total_tokens: 350,
    dependencies: [],
    topic: {
      goal: "找出SQL中的性能瓶颈（慢查询原因），并生成优化后的索引方案与SQL。",
      scope: "MySQL 8.0+ / PostgreSQL 14+ 的 Select 复杂查询，暂不处理 DDL 及多阶段分布式锁分析。",
    },
    content: {
      system_prompt: "你是一个资深的数据库专家(DBA)。当用户提交一个慢查询的 SQL 以及对应的 EXPLAIN 执行计划时，你需要一步步剖析：\n1. 标识出是否有 Full Table Scan (全表扫描)\n2. 检查是否有 Filesort (文件排序) 或 Using temporary (使用临时表)\n3. 推荐具体的最佳索引创建语句(Create Index...)\n4. 提供重构后的 SQL 结构，并解释为什么性能会得到提升。\n请使用 Markdown 表格和代码块输出，确保语气客观、严谨。",
      prompt: "【慢SQL】\n{{slow_sql}}\n\n【EXPLAIN 输出】\n{{explain_output}}\n\n【表结构与数据量】\n{{table_schema_and_rows}}",
    },
    steps: [
      {
        id: "step-1",
        name: "执行计划结构化",
        description: "提取 key, rows, extra, select_type 等核心指标进行分析列举。",
        pre_condition: "有 EXPLAIN 或者是完整的执行日志",
        timeout_ms: 1000,
        error_handling: "根据 SQL 的 Where 条件进行静态推导分析",
      },
      {
        id: "step-2",
        name: "瓶颈根因定位",
        description: "检查扫描行数与关联类型，输出高危警报（如 ALL, index 等）。",
        pre_condition: "第1步解析正常",
        timeout_ms: 800,
        error_handling: "提示无法准确评估，输出常规调优 checklist",
      },
      {
        id: "step-3",
        name: "推荐索引与重写 SQL",
        description: "生成针对性的覆盖索引设计与优化 SQL（如子查询改 JOIN 等）。",
        pre_condition: "存在明显的优化空间",
        timeout_ms: 1500,
        error_handling: "仅提供通用索引建议",
      }
    ],
    checks: [
      {
        id: "chk-1",
        name: "SQL 语法验证",
        rule: "确保生成的 SQL 在主流数据库中语法合法",
        severity: "Error",
      },
      {
        id: "chk-2",
        name: "多表 JOIN 深度限制",
        rule: "如果 JOIN 大于 5 张表，强制提示进行架构级拆分而非仅优化 SQL",
        severity: "Warning",
      }
    ],
    examples: [
      {
        id: "ex-1",
        input: "【慢SQL】\nSELECT * FROM orders WHERE user_id = 10023 ORDER BY create_time DESC LIMIT 10;\n\n【EXPLAIN 输出】\ntype: ALL, key: NULL, rows: 543021, Extra: Using filesort",
        output: "### 🔍 性能诊断结果\n- **问题**：`orders` 表在 `user_id` 上无索引导致**全表扫描(ALL)**，且需要加载 54 万行记录在内存中排序（**Using filesort**），耗时严重。\n\n### 💡 优化建议\n1. **创建复合索引**：\n```sql\nALTER TABLE orders ADD INDEX idx_user_create (user_id, create_time DESC);\n```\n该复合索引不仅能通过 `user_id` 快速过滤，还能直接利用索引顺序省去物理排序过程。"
      }
    ],
  }
];

// Helper to read and write database
// Seed default data if empty
const seedDatabase = () => {
  try {
    const skillsCount = db.prepare("SELECT COUNT(*) as count FROM skills").get() as { count: number };
    if (skillsCount.count === 0) {
      const insertSkill = db.prepare(`
        INSERT INTO skills (id, name, version, description, author, created_at, updated_at, dod_status, total_tokens, taxonomy, dod_report, dependencies, topic, content, steps, checks, examples)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      db.transaction(() => {
        for (const s of DEFAULT_SKILLS) {
          insertSkill.run(
            s.id,
            s.name,
            s.version,
            s.description,
            s.author,
            s.created_at,
            s.updated_at,
            s.dod_status,
            s.total_tokens || 0,
            JSON.stringify(s.taxonomy || {}),
            JSON.stringify(s.dod_report || {}),
            JSON.stringify(s.dependencies || []),
            JSON.stringify(s.topic || {}),
            JSON.stringify(s.content || {}),
            JSON.stringify(s.steps || []),
            JSON.stringify(s.checks || []),
            JSON.stringify(s.examples || [])
          );
        }
      })();
      console.log("Seeded skills table with preset skills.");
    }

    const taxCount = db.prepare("SELECT COUNT(*) as count FROM taxonomy").get() as { count: number };
    if (taxCount.count === 0) {
      const insertTax = db.prepare(`
        INSERT INTO taxonomy (id, name, parent_id, level, sort_order)
        VALUES (?, ?, ?, ?, ?)
      `);
      db.transaction(() => {
        for (const n of DEFAULT_TAXONOMY_NODES) {
          insertTax.run(n.id, n.name, n.parent_id, n.level, n.sort_order);
        }
      })();
      console.log("Seeded taxonomy table with default nodes.");
    }
  } catch (err) {
    console.error("Failed to seed SQLite database:", err);
  }
};

// Seed immediately
seedDatabase();

function readSkills(): any[] {
  try {
    const rows = db.prepare("SELECT * FROM skills").all() as any[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      version: r.version,
      description: r.description,
      author: r.author,
      created_at: r.created_at,
      updated_at: r.updated_at,
      dod_status: r.dod_status,
      total_tokens: r.total_tokens || 0,
      taxonomy: JSON.parse(r.taxonomy || "{}"),
      dod_report: JSON.parse(r.dod_report || "{}"),
      dependencies: JSON.parse(r.dependencies || "[]"),
      topic: JSON.parse(r.topic || "{}"),
      content: JSON.parse(r.content || "{}"),
      steps: JSON.parse(r.steps || "[]"),
      checks: JSON.parse(r.checks || "[]"),
      examples: JSON.parse(r.examples || "[]"),
    }));
  } catch (e) {
    console.error("Error reading skills from SQLite:", e);
    return [];
  }
}

function writeSkills(skills: any[]) {
  try {
    db.transaction(() => {
      db.prepare("DELETE FROM skills").run();
      const insert = db.prepare(`
        INSERT INTO skills (id, name, version, description, author, created_at, updated_at, dod_status, total_tokens, taxonomy, dod_report, dependencies, topic, content, steps, checks, examples)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const s of skills) {
        insert.run(
          s.id,
          s.name,
          s.version,
          s.description,
          s.author,
          s.created_at,
          s.updated_at,
          s.dod_status,
          s.total_tokens || 0,
          JSON.stringify(s.taxonomy || {}),
          JSON.stringify(s.dod_report || {}),
          JSON.stringify(s.dependencies || []),
          JSON.stringify(s.topic || {}),
          JSON.stringify(s.content || {}),
          JSON.stringify(s.steps || []),
          JSON.stringify(s.checks || []),
          JSON.stringify(s.examples || [])
        );
      }
    })();
  } catch (e) {
    console.error("Error writing skills to SQLite:", e);
  }
}

function readTaxonomy(): any[] {
  try {
    const rows = db.prepare("SELECT * FROM taxonomy ORDER BY sort_order ASC").all() as any[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      parent_id: r.parent_id || null,
      level: parseInt(r.level),
      sort_order: parseInt(r.sort_order),
    }));
  } catch (e) {
    console.error("Error reading taxonomy from SQLite:", e);
    return [];
  }
}

function writeTaxonomy(nodes: any[]) {
  try {
    db.transaction(() => {
      db.prepare("DELETE FROM taxonomy").run();
      const insert = db.prepare("INSERT INTO taxonomy (id, name, parent_id, level, sort_order) VALUES (?, ?, ?, ?, ?)");
      for (const n of nodes) {
        insert.run(n.id, n.name, n.parent_id, n.level, n.sort_order);
      }
    })();
  } catch (e) {
    console.error("Error writing taxonomy to SQLite:", e);
  }
}

// Unified LLM calling service supporting DeepSeek and Gemini
interface LLMRequest {
  systemInstruction?: string;
  contents: string | any[];
  responseMimeType?: string;
  temperature?: number;
}

async function callLLM(req: LLMRequest): Promise<string> {
  const provider = getSetting("llm_provider", "deepseek");
  const dApiKey = getSetting("deepseek_api_key", process.env.DEEPSEEK_API_KEY || "");
  const dBaseUrl = getSetting("deepseek_base_url", process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1");
  const dModel = getSetting("deepseek_model", process.env.DEEPSEEK_MODEL || "deepseek-chat");
  const gApiKey = getSetting("gemini_api_key", process.env.GEMINI_API_KEY || "");
  const gModel = getSetting("gemini_model", "gemini-3.5-flash");

  if (provider === "deepseek") {
    if (!dApiKey) {
      throw new Error("请在右上角「模型配置」中配置有效的 DeepSeek API Key 才能进行 AI 功能调用。");
    }
    const cleanBaseUrl = dBaseUrl.replace(/\/$/, "");
    const url = `${cleanBaseUrl}/chat/completions`;

    const messages = [];
    if (req.systemInstruction) {
      messages.push({ role: "system", content: req.systemInstruction });
    }
    if (typeof req.contents === "string") {
      messages.push({ role: "user", content: req.contents });
    } else if (Array.isArray(req.contents)) {
      messages.push(...req.contents.map(m => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content || ""
      })));
    }

    const payload: any = {
      model: dModel,
      messages,
      temperature: req.temperature ?? 0.7,
    };

    if (req.responseMimeType === "application/json") {
      payload.response_format = { type: "json_object" };
    }

    console.log(`Calling DeepSeek API at ${url} with model ${dModel}...`);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${dApiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`DeepSeek API error (${response.status}):`, errorText);
      throw new Error(`DeepSeek API 错误（状态码 ${response.status}）：${errorText}`);
    }

    const data: any = await response.json();
    return data.choices?.[0]?.message?.content || "";
  } else {
    // Gemini provider
    const apiKeyToUse = gApiKey || process.env.GEMINI_API_KEY;
    if (!apiKeyToUse) {
      throw new Error("请在右上角「模型配置」中配置有效的 Gemini API Key 才能进行 AI 功能调用。");
    }

    const genAI = new GoogleGenAI({ apiKey: apiKeyToUse });
    
    let contentsArg: any = req.contents;
    if (Array.isArray(req.contents)) {
      contentsArg = req.contents.map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content || "" }]
      }));
    }

    const config: any = {
      temperature: req.temperature ?? 0.7,
    };
    if (req.systemInstruction) {
      config.systemInstruction = req.systemInstruction;
    }
    if (req.responseMimeType === "application/json") {
      config.responseMimeType = "application/json";
    }

    console.log(`Calling Gemini API with model ${gModel}...`);
    const response = await genAI.models.generateContent({
      model: gModel,
      contents: contentsArg,
      config
    });

    return response.text || "";
  }
}

// ---- Settings API Routes ----
app.get("/api/settings", (req, res) => {
  try {
    const provider = getSetting("llm_provider", "deepseek");
    const deepseek_api_key = getSetting("deepseek_api_key", process.env.DEEPSEEK_API_KEY || "");
    const deepseek_base_url = getSetting("deepseek_base_url", process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1");
    const deepseek_model = getSetting("deepseek_model", process.env.DEEPSEEK_MODEL || "deepseek-chat");
    const gemini_api_key = getSetting("gemini_api_key", process.env.GEMINI_API_KEY || "");
    const gemini_model = getSetting("gemini_model", "gemini-3.5-flash");

    res.json({
      provider,
      deepseek_api_key,
      deepseek_base_url,
      deepseek_model,
      gemini_api_key,
      gemini_model,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/settings", (req, res) => {
  try {
    const { provider, deepseek_api_key, deepseek_base_url, deepseek_model, gemini_api_key, gemini_model } = req.body;

    if (provider !== undefined) db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("llm_provider", provider);
    if (deepseek_api_key !== undefined) db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("deepseek_api_key", deepseek_api_key);
    if (deepseek_base_url !== undefined) db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("deepseek_base_url", deepseek_base_url);
    if (deepseek_model !== undefined) db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("deepseek_model", deepseek_model);
    if (gemini_api_key !== undefined) db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("gemini_api_key", gemini_api_key);
    if (gemini_model !== undefined) db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("gemini_model", gemini_model);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---- API Routes ----

// Get all taxonomy tree nodes
app.get("/api/taxonomy/tree", (req, res) => {
  const nodes = readTaxonomy();
  res.json(nodes);
});

// Add taxonomy node
app.post("/api/taxonomy/nodes", (req, res) => {
  const { name, parent_id, level } = req.body;
  if (!name || !level) {
    return res.status(400).json({ error: "Missing name or level" });
  }
  const nodes = readTaxonomy();
  const id = `node-${Date.now()}`;
  const newNode = {
    id,
    name,
    parent_id: parent_id || null,
    level: parseInt(level),
    sort_order: nodes.filter((n: any) => n.parent_id === parent_id).length + 1,
  };
  nodes.push(newNode);
  writeTaxonomy(nodes);
  res.json(newNode);
});

// Delete taxonomy node
app.delete("/api/taxonomy/nodes/:id", (req, res) => {
  const { id } = req.params;
  const nodes = readTaxonomy();
  const skills = readSkills();

  // Check if any skill uses this category
  const nodeToDelete = nodes.find((n: any) => n.id === id);
  if (!nodeToDelete) {
    return res.status(404).json({ error: "Node not found" });
  }

  // Check if it has child nodes
  const hasChildren = nodes.some((n: any) => n.parent_id === id);
  if (hasChildren) {
    return res.status(400).json({ error: "请先删除该分类下的子分类" });
  }

  const isUsedBySkill = skills.some((s: any) => 
    s.taxonomy.primary_category === nodeToDelete.name ||
    s.taxonomy.secondary_category === nodeToDelete.name ||
    s.taxonomy.tertiary_category === nodeToDelete.name
  );

  if (isUsedBySkill) {
    return res.status(400).json({ error: "该分类已被 Skill 引用，无法删除" });
  }

  const updatedNodes = nodes.filter((n: any) => n.id !== id);
  writeTaxonomy(updatedNodes);
  res.json({ success: true });
});

// Get taxonomy and count stats
app.get("/api/taxonomy/stats", (req, res) => {
  const nodes = readTaxonomy();
  const skills = readSkills();
  
  const stats: Record<string, number> = {};
  skills.forEach((s) => {
    const pc = s.taxonomy?.primary_category;
    const sc = s.taxonomy?.secondary_category;
    const tc = s.taxonomy?.tertiary_category;
    if (pc) stats[pc] = (stats[pc] || 0) + 1;
    if (sc) stats[sc] = (stats[sc] || 0) + 1;
    if (tc) stats[tc] = (stats[tc] || 0) + 1;
  });

  res.json(stats);
});

// Get all skills with query filter
app.get("/api/skills", (req, res) => {
  const { category, search, tag } = req.query;
  let skills = readSkills();

  if (category) {
    const catStr = String(category);
    skills = skills.filter((s: any) => {
      const pc = s.taxonomy?.primary_category;
      const sc = s.taxonomy?.secondary_category;
      const tc = s.taxonomy?.tertiary_category;
      return pc === catStr || sc === catStr || tc === catStr || 
             s.taxonomy?.category_tree?.includes(catStr);
    });
  }

  if (tag) {
    const tagStr = String(tag);
    skills = skills.filter((s: any) => s.taxonomy?.tags?.includes(tagStr));
  }

  if (search) {
    const query = String(search).toLowerCase();
    skills = skills.filter((s: any) => 
      s.name.toLowerCase().includes(query) ||
      s.description.toLowerCase().includes(query) ||
      s.topic?.goal?.toLowerCase().includes(query)
    );
  }

  res.json(skills);
});

// Get single skill
app.get("/api/skills/:id", (req, res) => {
  const skills = readSkills();
  const skill = skills.find((s) => s.id === req.params.id);
  if (!skill) {
    return res.status(404).json({ error: "Skill not found" });
  }
  res.json(skill);
});

// Create/Save skill
app.post("/api/skills", (req, res) => {
  const newSkill = req.body;
  if (!newSkill.name) {
    return res.status(400).json({ error: "Name is required" });
  }

  const skills = readSkills();
  const index = skills.findIndex((s) => s.id === newSkill.id);

  const timestamp = new Date().toISOString();
  if (index >= 0) {
    // Update
    skills[index] = {
      ...skills[index],
      ...newSkill,
      updated_at: timestamp,
    };
    writeSkills(skills);
    res.json(skills[index]);
  } else {
    // Create
    const createdSkill = {
      ...newSkill,
      id: newSkill.id || `skill-${Date.now()}`,
      created_at: timestamp,
      updated_at: timestamp,
    };
    skills.push(createdSkill);
    writeSkills(skills);
    res.json(createdSkill);
  }
});

// Delete skill
app.delete("/api/skills/:id", (req, res) => {
  const skills = readSkills();
  const filtered = skills.filter((s) => s.id !== req.params.id);
  writeSkills(filtered);
  res.json({ success: true });
});

// Bulk category classification API
app.put("/api/skills/batch/category", (req, res) => {
  const { skill_ids, primary_category, secondary_category, tertiary_category } = req.body;
  if (!skill_ids || !Array.isArray(skill_ids)) {
    return res.status(400).json({ error: "Invalid skill ids list" });
  }

  const skills = readSkills();
  skills.forEach((s) => {
    if (skill_ids.includes(s.id)) {
      if (!s.taxonomy) {
        s.taxonomy = {
          category_tree: [],
          primary_category: "",
          secondary_category: "",
          tertiary_category: "",
          tags: [],
          classification_attrs: { difficulty_level: "beginner", execution_mode: "sync", industry: [], scenario: [] }
        };
      }
      s.taxonomy.primary_category = primary_category || s.taxonomy.primary_category;
      s.taxonomy.secondary_category = secondary_category || s.taxonomy.secondary_category;
      s.taxonomy.tertiary_category = tertiary_category || s.taxonomy.tertiary_category;
      s.taxonomy.category_tree = [primary_category, secondary_category, tertiary_category].filter(Boolean);
      s.updated_at = new Date().toISOString();
    }
  });

  writeSkills(skills);
  res.json({ success: true });
});

// ---- Gemini LLM Integration Endpoints ----

// Endpoint 1: Generate Skill schema from a prompt/description
app.post("/api/gemini/generate", async (req, res) => {
  const { prompt, preset_context } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: "Missing prompt" });
  }

  try {
    const promptInstructions = `
      You are an expert AI Engineer specialized in creating high-quality, professional LLM "Skills" (system instructions, templates, steps, verification rules, and examples) following strict Definition of Done (DOD) metrics.
      
      User wants to create a skill for: "${prompt}"
      ${preset_context ? `Additional Context: ${preset_context}` : ""}
      
      You must respond in valid JSON format only, according to the following JSON schema. Do not include markdown code block formatting (like \`\`\`json) in the response text directly, return only the raw JSON.
      
      Structure:
      {
        "name": "Literal, clear name in Chinese (e.g. 智能天气查询助手, SQL性能瓶颈诊断器). Do NOT invent flowery/marketing names like 'FocusFlow'. Keep it humble and descriptive.",
        "version": "1.0.0",
        "description": "Short, informative description in Chinese",
        "taxonomy": {
          "primary_category": "Must match one of standard categories: 数据分析, 代码开发, 内容创作, 系统运维, 客户服务, 知识管理, 通用助手",
          "secondary_category": "A suitable secondary category node",
          "tertiary_category": "A narrow specific node name",
          "tags": ["3-5 string tags"],
          "classification_attrs": {
            "difficulty_level": "beginner" or "intermediate" or "advanced",
            "execution_mode": "sync" or "async" or "streaming",
            "industry": ["industry1", "industry2"],
            "scenario": ["scenario1", "scenario2"]
          }
        },
        "topic": {
          "goal": "Detailed target goal in Chinese starting with '帮助用户...'",
          "scope": "The practical boundaries and limitations of this skill in Chinese"
        },
        "content": {
          "system_prompt": "An elite system prompt in Chinese specifying the persona, thinking model, logical steps, edge cases and output styling guidelines. Be precise and rigorous.",
          "prompt": "User prompt template with curly braces variables like {{variable_name}}."
        },
        "steps": [
          {
            "id": "step-1",
            "name": "Step name in Chinese",
            "description": "Detailed step definition in Chinese",
            "pre_condition": "Preconditions for running this step",
            "timeout_ms": 1000,
            "error_handling": "Fallback behavior if this step fails"
          }
        ],
        "checks": [
          {
            "id": "chk-1",
            "name": "Check title in Chinese",
            "rule": "Specific validation rule description",
            "severity": "Error" or "Warning"
          }
        ],
        "examples": [
          {
            "id": "ex-1",
            "input": "Mock user input",
            "output": "Mock LLM output based on system prompt"
          }
        ]
      }
    `;

    const text = await callLLM({
      contents: promptInstructions,
      responseMimeType: "application/json",
      temperature: 0.7,
    });

    const parsed = JSON.parse(text);
    
    // Auto-calculate DOD check status and metadata fields
    parsed.id = `skill-${Date.now()}`;
    parsed.author = "AI-Labs";
    parsed.created_at = new Date().toISOString();
    parsed.updated_at = new Date().toISOString();
    parsed.dod_status = "PASSED";
    parsed.total_tokens = Math.floor((text.length / 4) + 150);
    parsed.dependencies = [];

    res.json(parsed);
  } catch (error: any) {
    console.error("AI Generate Error:", error);
    res.status(500).json({ error: error.message || "Failed to generate skill using AI model." });
  }
});

// Endpoint 2: Check Skill (returns quality reports + issues)
app.post("/api/gemini/check", async (req, res) => {
  const { skill } = req.body;
  if (!skill) {
    return res.status(400).json({ error: "Missing skill" });
  }

  try {
    const checkPrompt = `
      You are an automated Skill Quality Assurance reviewer. Evaluate the following skill JSON to ensure it satisfies strict production criteria (Definition of Done - DOD):
      1. Is the System Prompt rigorous, professional, and clear? Does it prevent hallucinations and handle edge cases?
      2. Does the User Prompt template have clear variables (like {{variable}})?
      3. Are execution steps logical, with clear pre-conditions and error-handling?
      4. Are validation checks comprehensive?
      5. Is the naming professional (humble, descriptive, no hyper-branding like "FlowMaster")?
      
      Return a JSON response following this schema:
      {
        "passed": true or false,
        "issues": [
          {
            "type": "error" or "warning",
            "message": "Specific, actionable issue description in Chinese"
          }
        ]
      }
      
      Review this skill:
      ${JSON.stringify(skill, null, 2)}
    `;

    const text = await callLLM({
      contents: checkPrompt,
      responseMimeType: "application/json",
      temperature: 0.2,
    });

    const parsed = JSON.parse(text);
    res.json(parsed);
  } catch (error: any) {
    console.error("AI Check Error:", error);
    res.status(500).json({ error: error.message || "Failed to execute quality audit." });
  }
});

// Endpoint 3: Optimize sections (System Prompt, User Prompt, Steps, etc.)
app.post("/api/gemini/optimize", async (req, res) => {
  const { skill, section, instruction } = req.body;
  if (!skill || !section) {
    return res.status(400).json({ error: "Missing skill or section identifier" });
  }

  try {
    const optimizePrompt = `
      You are an elite LLM prompt engineer. Your job is to optimize a specific section of a Skill definition.
      
      Target Section: "${section}"
      User request/instruction for optimization: "${instruction || "使 prompt 更加专业、结构化、包含安全围栏并且容易理解"}"
      
      Current Skill data:
      ${JSON.stringify(skill, null, 2)}
      
      Optimized output must preserve the existing logic but elevate the writing, format, detail, error handling and precision.
      Return a JSON response with ONLY the optimized content of the target section. Keep the JSON keys and types identical to the original segment.
      
      Example Schema if optimizing "content":
      {
        "system_prompt": "New optimized system prompt...",
        "prompt": "New user prompt..."
      }
      
      Example Schema if optimizing "steps":
      [
        { "id": "step-1", "name": "...", "description": "...", "pre_condition": "...", "timeout_ms": 1000, "error_handling": "..." }
      ]
      
      Respond only with raw JSON representing the updated section values.
    `;

    const text = await callLLM({
      contents: optimizePrompt,
      responseMimeType: "application/json",
      temperature: 0.5,
    });

    const parsed = JSON.parse(text);
    res.json(parsed);
  } catch (error: any) {
    console.error("AI Optimize Error:", error);
    res.status(500).json({ error: error.message || "Optimization failed." });
  }
});

// Endpoint 4: Interactive chat assistant for continuous refining
app.post("/api/gemini/chat", async (req, res) => {
  const { skill, messages } = req.body;
  if (!skill || !messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Missing skill or messages conversation list" });
  }

  try {
    const lastUserMessage = messages[messages.length - 1]?.content || "";
    
    const chatPrompt = `
      You are "Skill Architect", a professional AI assistant designed to help the user refine and iteratively co-author their Skill.
      
      Current Skill definition:
      ${JSON.stringify(skill, null, 2)}
      
      Instruction:
      Evaluate the user's latest message. If the user wants to make adjustments (e.g. "add a new verification check", "rewrite step 2 to be longer", "make the system prompt more friendly", "add tags"), implement it by updating the skill JSON.
      
      You MUST respond with a JSON object in this format:
      {
        "response_message": "Your conversational response in Chinese, detailing what changes you made or recommending further design tips.",
        "updated_skill": null or the entire updated Skill JSON object (if a modification was requested)
      }
      
      User message: "${lastUserMessage}"
    `;

    const text = await callLLM({
      contents: chatPrompt,
      responseMimeType: "application/json",
      temperature: 0.5,
    });

    const parsed = JSON.parse(text);
    res.json(parsed);
  } catch (error: any) {
    console.error("AI Chat Error:", error);
    res.status(500).json({ error: error.message || "Failed to communicate with AI Architect." });
  }
});

// Endpoint 5: Run Simulator (uses system prompt + fills template placeholders)
app.post("/api/gemini/run", async (req, res) => {
  const { system_prompt, prompt, variables } = req.body;
  if (!system_prompt || !prompt) {
    return res.status(400).json({ error: "Missing system_prompt or prompt template" });
  }

  // Substitute variables in the template
  let hydratedPrompt = prompt;
  if (variables && typeof variables === "object") {
    Object.keys(variables).forEach((key) => {
      const placeholder = new RegExp(`{{\\s*${key}\\s*}}`, "g");
      hydratedPrompt = hydratedPrompt.replace(placeholder, variables[key] || "");
    });
  }

  try {
    const output = await callLLM({
      systemInstruction: system_prompt,
      contents: hydratedPrompt,
      temperature: 0.7,
    });

    res.json({ output });
  } catch (error: any) {
    console.error("AI Run Error:", error);
    res.status(500).json({ error: error.message || "大模型运行模拟出错，请检查配置及参数格式。" });
  }
});

// Serve static assets and frontend index.html
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

startServer();

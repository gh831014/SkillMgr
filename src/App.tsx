/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  BookOpen,
  Code,
  FileText,
  FileCode,
  CheckCircle,
  AlertTriangle,
  Plus,
  Trash2,
  Save,
  Download,
  Copy,
  Sparkles,
  Play,
  Layers,
  Tag,
  FolderPlus,
  ChevronRight,
  Send,
  HelpCircle,
  Eye,
  Check,
  RotateCcw,
  BookMarked,
  Layout,
  ExternalLink,
  Settings,
  Activity,
  Maximize2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import JSZip from "jszip";
import Markdown from "react-markdown";

import {
  Skill,
  Taxonomy,
  TaxonomyNode,
  TaxonomyTreeItem,
  DifficultyLevel,
  ExecutionMode,
  SkillStep,
  SkillCheck,
  SkillExample
} from "./types";

export default function App() {
  // ---- Core States ----
  const [skills, setSkills] = useState<Skill[]>([]);
  const [currentSkill, setCurrentSkill] = useState<Skill | null>(null);
  const [taxonomyNodes, setTaxonomyNodes] = useState<TaxonomyNode[]>([]);
  const [categoryStats, setCategoryStats] = useState<Record<string, number>>({});
  
  // ---- Sidebar Filters ----
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // ---- Interaction/Loading States ----
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatePrompt, setGeneratePrompt] = useState("");
  const [isCheckingDOD, setIsCheckingDOD] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  // ---- Creator Dialogs ----
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatParentId, setNewCatParentId] = useState<string>("");
  const [newCatLevel, setNewCatLevel] = useState<number>(1);

  // ---- Markdown Export Modal ----
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportOptions, setExportOptions] = useState({
    includeExamples: true,
    includeDOD: true,
    minify: false,
  });
  const [mdPreviewText, setMdPreviewText] = useState("");

  // ---- Chat Assistant ----
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([
    {
      role: "assistant",
      content: "您好！我是您的 Skill 架构师。我可以协助您生成新 Skill，优化系统提示词，提取执行步骤，配置 DOD 检查规范。请在下方输入您的诉求，或点击快速操作指引！",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ---- Run Simulator States ----
  const [simInputs, setSimInputs] = useState<Record<string, string>>({});
  const [simOutput, setSimOutput] = useState("");

  // ---- Local UI States ----
  const [activeTab, setActiveTab] = useState<"edit" | "preview" | "simulate">("edit");
  const [bulkSelectIds, setBulkSelectIds] = useState<string[]>([]);
  const [showBulkCategoryModal, setShowBulkCategoryModal] = useState(false);
  const [bulkCategory, setBulkCategory] = useState({ primary: "", secondary: "", tertiary: "" });

  // ---- Model Settings States ----
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settings, setSettings] = useState({
    provider: "deepseek",
    deepseek_api_key: "",
    deepseek_base_url: "https://api.deepseek.com/v1",
    deepseek_model: "deepseek-chat",
    gemini_api_key: "",
    gemini_model: "gemini-3.5-flash",
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      setSettings(data);
    } catch (e) {
      console.error("Error loading settings:", e);
    }
  };

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        showNotification("⚙️ 模型配置保存成功！已持久化至数据库。");
        setShowSettingsModal(false);
      } else {
        showNotification("❌ 配置保存失败，请稍后重试", "error");
      }
    } catch (e) {
      console.error("Error saving settings:", e);
      showNotification("❌ 网络连接错误，无法保存配置", "error");
    } finally {
      setIsSavingSettings(false);
    }
  };

  // ---- Load initial data on mount ----
  useEffect(() => {
    fetchSkills();
    fetchTaxonomy();
    fetchStats();
    fetchSettings();
  }, []);

  // Scroll chat assistant to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Synchronize simulator input variables when currentSkill prompt changes
  useEffect(() => {
    if (currentSkill) {
      const vars = extractVariables(currentSkill.content.prompt);
      const newInputs: Record<string, string> = {};
      vars.forEach((v) => {
        newInputs[v] = simInputs[v] || "";
      });
      setSimInputs(newInputs);
    }
  }, [currentSkill?.content.prompt]);

  // ---- Data Fetching / API Helpers ----
  const fetchSkills = async (categoryFilter?: string) => {
    try {
      let url = "/api/skills";
      const params = new URLSearchParams();
      if (categoryFilter) params.append("category", categoryFilter);
      if (searchQuery) params.append("search", searchQuery);
      if (selectedTag) params.append("tag", selectedTag);
      
      const res = await fetch(`${url}?${params.toString()}`);
      const data = await res.json();
      setSkills(data);
      if (data.length > 0 && !currentSkill) {
        // Set first skill as default
        setCurrentSkill(data[0]);
      }
    } catch (e) {
      console.error("Error loading skills:", e);
    }
  };

  const fetchTaxonomy = async () => {
    try {
      const res = await fetch("/api/taxonomy/tree");
      const data = await res.json();
      setTaxonomyNodes(data);
    } catch (e) {
      console.error("Error loading taxonomy:", e);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/taxonomy/stats");
      const data = await res.json();
      setCategoryStats(data);
    } catch (e) {
      console.error("Error loading stats:", e);
    }
  };

  // Extract variables in {{variable}} format
  const extractVariables = (text: string): string[] => {
    const regex = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;
    const matches = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (!matches.includes(match[1])) {
        matches.push(match[1]);
      }
    }
    return matches;
  };

  // Save changes of current skill to backend
  const handleSaveSkill = async (skillToSave: Skill = currentSkill!) => {
    if (!skillToSave) return;
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(skillToSave),
      });
      const saved = await res.json();
      
      // Update lists
      setSkills(prev => prev.map(s => s.id === saved.id ? saved : s));
      setCurrentSkill(saved);
      fetchStats();
      showNotification("💾 Skill 保存成功");
    } catch (e) {
      console.error("Error saving skill:", e);
      showNotification("❌ 保存失败，请检查网络", "error");
    }
  };

  // Delete a skill
  const handleDeleteSkill = async (id: string) => {
    if (!window.confirm("确定要删除此 Skill 吗？此操作不可撤销。")) return;
    try {
      await fetch(`/api/skills/${id}`, { method: "DELETE" });
      setSkills(prev => prev.filter(s => s.id !== id));
      if (currentSkill?.id === id) {
        setCurrentSkill(skills.find(s => s.id !== id) || null);
      }
      fetchStats();
      showNotification("🗑️ Skill 已成功删除");
    } catch (e) {
      console.error("Error deleting skill:", e);
    }
  };

  // Generate completely new skill using Gemini
  const handleGenerateSkill = async () => {
    if (!generatePrompt.trim()) return;
    setIsGenerating(true);
    try {
      const res = await fetch("/api/gemini/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: generatePrompt }),
      });
      const generatedSkill = await res.json();
      
      // Add to local state
      setSkills(prev => [generatedSkill, ...prev]);
      setCurrentSkill(generatedSkill);
      setGeneratePrompt("");
      showNotification("✨ AI 成功生成全新 Skill 模型！");
      
      // Save it to disk right away
      handleSaveSkill(generatedSkill);
    } catch (e) {
      console.error("Error generating skill:", e);
      showNotification("❌ AI 生成失败，请稍后重试", "error");
    } finally {
      setIsGenerating(false);
    }
  };

  // Execute QA automated DOD check via LLM
  const handleCheckDOD = async () => {
    if (!currentSkill) return;
    setIsCheckingDOD(true);
    try {
      const res = await fetch("/api/gemini/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill: currentSkill }),
      });
      const report = await res.json();
      
      const updated = {
        ...currentSkill,
        dod_status: report.passed ? ("PASSED" as const) : ("FAILED" as const),
        dod_report: {
          passed: report.passed,
          issues: report.issues || [],
        },
      };

      setCurrentSkill(updated);
      handleSaveSkill(updated);
      showNotification(report.passed ? "✅ DOD 审核通过！" : "⚠️ 质量审核发现一些潜在问题");
    } catch (e) {
      console.error("QA check failed:", e);
      showNotification("❌ 审计服务不可用", "error");
    } finally {
      setIsCheckingDOD(false);
    }
  };

  // Optimize section with LLM guidance
  const handleOptimizeSection = async (section: string, instruction: string = "") => {
    if (!currentSkill) return;
    setIsOptimizing(section);
    try {
      const res = await fetch("/api/gemini/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skill: currentSkill,
          section,
          instruction,
        }),
      });
      const optimizedData = await res.json();
      
      let updated = { ...currentSkill };
      if (section === "content") {
        updated.content = optimizedData;
      } else if (section === "steps") {
        updated.steps = optimizedData;
      } else if (section === "checks") {
        updated.checks = optimizedData;
      } else if (section === "topic") {
        updated.topic = optimizedData;
      }

      setCurrentSkill(updated);
      showNotification(`✨ ${getSectionLabel(section)} 模块已优化`);
    } catch (e) {
      console.error("Optimization failed:", e);
      showNotification("❌ 优化失败", "error");
    } finally {
      setIsOptimizing(null);
    }
  };

  // Chat with the Skill Architect
  const handleSendChat = async () => {
    if (!chatInput.trim() || !currentSkill) return;
    const userMsg = chatInput;
    setChatMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setChatInput("");
    setIsChatLoading(true);

    try {
      const res = await fetch("/api/gemini/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skill: currentSkill,
          messages: [...chatMessages, { role: "user", content: userMsg }],
        }),
      });
      const data = await res.json();
      
      setChatMessages(prev => [...prev, { role: "assistant", content: data.response_message }]);
      
      if (data.updated_skill) {
        setCurrentSkill(data.updated_skill);
        showNotification("⚡ AI 辅助协同：已自动为您更新 Skill 结构项");
      }
    } catch (e) {
      console.error("Chat failed:", e);
      setChatMessages(prev => [...prev, { role: "assistant", content: "抱歉，我的大脑连接受阻，无法实时处理您的诉求。" }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Run the skill simulator
  const handleRunSimulation = async () => {
    if (!currentSkill) return;
    setIsSimulating(true);
    setSimOutput("");
    try {
      const res = await fetch("/api/gemini/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_prompt: currentSkill.content.system_prompt,
          prompt: currentSkill.content.prompt,
          variables: simInputs,
        }),
      });
      const data = await res.json();
      setSimOutput(data.output);
    } catch (e) {
      console.error("Simulation run failed:", e);
      setSimOutput("❌ 模拟运行出错，请确保 API 密钥有效配置");
    } finally {
      setIsSimulating(false);
    }
  };

  // Add taxonomy category node
  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      const res = await fetch("/api/taxonomy/nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCatName,
          parent_id: newCatParentId || null,
          level: newCatLevel,
        }),
      });
      if (res.ok) {
        fetchTaxonomy();
        setNewCatName("");
        setShowAddCategoryModal(false);
        showNotification("📁 分类节点创建成功");
      }
    } catch (e) {
      console.error("Failed to add category:", e);
    }
  };

  // Batch update categories
  const handleBatchUpdateCategory = async () => {
    if (bulkSelectIds.length === 0) return;
    try {
      const res = await fetch("/api/skills/batch/category", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skill_ids: bulkSelectIds,
          primary_category: bulkCategory.primary,
          secondary_category: bulkCategory.secondary,
          tertiary_category: bulkCategory.tertiary,
        }),
      });
      if (res.ok) {
        fetchSkills();
        fetchStats();
        setBulkSelectIds([]);
        setShowBulkCategoryModal(false);
        showNotification("📦 批量分类更新成功");
      }
    } catch (e) {
      console.error("Batch update category failed:", e);
    }
  };

  // ---- MD Exporter Engine ----
  const generateMarkdownString = (skill: Skill, options = exportOptions) => {
    const yamlHeader = `---
id: "${skill.id}"
name: "${skill.name}"
version: "${skill.version}"
description: "${skill.description || ""}"
author: "${skill.author || ""}"
created_at: "${skill.created_at || ""}"
updated_at: "${skill.updated_at || ""}"

primary_category: "${skill.taxonomy?.primary_category || ""}"
secondary_category: "${skill.taxonomy?.secondary_category || ""}"
tertiary_category: "${skill.taxonomy?.tertiary_category || ""}"
tags: ${JSON.stringify(skill.taxonomy?.tags || [])}

difficulty: "${skill.taxonomy?.classification_attrs?.difficulty_level || "beginner"}"
execution_mode: "${skill.taxonomy?.classification_attrs?.execution_mode || "sync"}"
total_tokens: ${skill.total_tokens || 0}
${options.includeDOD ? `dod_status: "${skill.dod_status || "UNCHECKED"}"` : ""}
dependencies: ${JSON.stringify(skill.dependencies || [])}
---

`;

    let body = `# 🎯 主题定义

**目标**: ${skill.topic?.goal || "未定义"}

**适用范围**: ${skill.topic?.scope || "未定义"}

---

# 📝 核心内容

## 系统提示词（System Prompt）

\`\`\`
${skill.content?.system_prompt || ""}
\`\`\`

## 用户提示词模板（User Prompt）

\`\`\`
${skill.content?.prompt || ""}
\`\`\`

---

# 🔄 执行步骤（Steps）

${
  skill.steps?.length > 0
    ? skill.steps
        .map(
          (step, i) =>
            `${i + 1}. **【${step.name}】**：${step.description}
   - 前置条件: ${step.pre_condition || "无"}
   - 超时: ${step.timeout_ms || 1000}ms
   - 异常处理: ${step.error_handling || "无"}`
        )
        .join("\n\n")
    : "暂无执行步骤"
}

---

# ✅ 检查规范（Checks）

| 检查项 | 规则 | 严重级别 |
|--------|------|----------|
${
  skill.checks?.length > 0
    ? skill.checks
        .map((chk) => `| ${chk.name} | ${chk.rule} | ${chk.severity} |`)
        .join("\n")
    : "| 暂无检查项 | - | - |"
}

---
`;

    if (options.includeExamples) {
      body += `
# 📊 执行示例（Examples）

${
  skill.examples?.length > 0
    ? skill.examples
        .map(
          (ex, i) => `### 示例 ${i + 1}
**输入**:
\`\`\`
${ex.input}
\`\`\`

**输出**:
\`\`\`
${ex.output}
\`\`\`
`
        )
        .join("\n")
    : "暂无示例"
}`;
    }

    if (options.minify) {
      // Simple minification - strip excessive empty lines and headers
      return (yamlHeader + body)
        .replace(/\n{3,}/g, "\n\n")
        .replace(/<!--[\s\S]*?-->/g, "");
    }

    return yamlHeader + body;
  };

  const handleExportSingleMD = (skill: Skill) => {
    const text = generateMarkdownString(skill);
    setMdPreviewText(text);
    setShowExportModal(true);
  };

  const downloadMarkdownFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification("📥 .md 文件下载成功");
  };

  const handleBatchExportZIP = async () => {
    const selectedSkills = skills.filter((s) => bulkSelectIds.includes(s.id));
    if (selectedSkills.length === 0) {
      showNotification("请在列表中勾选要导出的 Skill", "error");
      return;
    }

    const zip = new JSZip();
    selectedSkills.forEach((s) => {
      const content = generateMarkdownString(s);
      const safeName = s.name.replace(/[\/\\?%*:|"<>\s]/g, "_");
      zip.file(`${safeName}.md`, content);
    });

    try {
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `skills_export_${Date.now()}.zip`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showNotification("📥 批量 .zip 打包下载成功");
      setBulkSelectIds([]);
    } catch (e) {
      console.error("ZIP Generation Failed:", e);
      showNotification("❌ 压缩打包失败", "error");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showNotification("📋 已成功复制到剪贴板");
  };

  // ---- Helper UI triggers ----
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const showNotification = (message: string, type: "success" | "error" = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const getSectionLabel = (sec: string) => {
    switch (sec) {
      case "content": return "提示词内容";
      case "steps": return "执行步骤";
      case "checks": return "检查规范";
      case "topic": return "主题定义";
      default: return sec;
    }
  };

  // Trigger search / tag filters
  useEffect(() => {
    fetchSkills(selectedCategory || undefined);
  }, [selectedCategory, searchQuery, selectedTag]);

  // Construct hierarchy items for the Category tree sidebar
  const buildTaxonomyTree = (): TaxonomyTreeItem[] => {
    const level1 = taxonomyNodes.filter(n => n.level === 1);
    return level1.map(l1 => {
      const level2 = taxonomyNodes.filter(n => n.level === 2 && n.parent_id === l1.id);
      return {
        id: l1.id,
        name: l1.name,
        level: 1,
        parent_id: null,
        count: categoryStats[l1.name] || 0,
        children: level2.map(l2 => {
          const level3 = taxonomyNodes.filter(n => n.level === 3 && n.parent_id === l2.id);
          return {
            id: l2.id,
            name: l2.name,
            level: 2,
            parent_id: l1.id,
            count: categoryStats[l2.name] || 0,
            children: level3.map(l3 => ({
              id: l3.id,
              name: l3.name,
              level: 3,
              parent_id: l2.id,
              count: categoryStats[l3.name] || 0
            }))
          };
        })
      };
    });
  };

  const handleCreateNewSkillBlank = () => {
    const blank: Skill = {
      id: `skill-${Date.now()}`,
      name: "新技能定义",
      version: "1.0.0",
      description: "一句话描述此技能的商业或生产力诉求",
      author: "AI-Labs",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      taxonomy: {
        category_tree: ["通用助手"],
        primary_category: "通用助手",
        secondary_category: "",
        tertiary_category: "",
        tags: [],
        classification_attrs: {
          difficulty_level: DifficultyLevel.BEGINNER,
          execution_mode: ExecutionMode.SYNC,
          industry: [],
          scenario: [],
        }
      },
      dod_status: "UNCHECKED",
      total_tokens: 0,
      dependencies: [],
      topic: { goal: "", scope: "" },
      content: { system_prompt: "", prompt: "" },
      steps: [],
      checks: [],
      examples: [],
    };
    setCurrentSkill(blank);
    setActiveTab("edit");
  };

  const allTags = Array.from(new Set(skills.flatMap(s => s.taxonomy?.tags || [])));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col antialiased">
      {/* Top Premium Navbar */}
      <header className="bg-white border-b border-slate-200/80 px-6 py-4 flex items-center justify-between sticky top-0 z-40 shadow-xs">
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-200">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold font-display tracking-tight text-slate-900 flex items-center">
              Skill 生产级大模型管理工具
              <span className="ml-2.5 px-2 py-0.5 text-xs bg-indigo-50 text-indigo-600 rounded-full font-medium font-mono border border-indigo-100">
                v2.5.0
              </span>
            </h1>
            <p className="text-xs text-slate-400">生成、审计、级联分类管理与交互式协同演进</p>
          </div>
        </div>

        {/* Search & Prompt Generator input inside header */}
        <div className="flex items-center space-x-3 w-1/3 max-w-md">
          <div className="relative w-full">
            <input
              type="text"
              placeholder="💡 告诉我您想要什么样的 Skill...（如：旅游推荐官）"
              className="w-full bg-slate-100 border border-slate-200 rounded-lg pl-3 pr-10 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              value={generatePrompt}
              onChange={(e) => setGeneratePrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleGenerateSkill()}
              disabled={isGenerating}
            />
            <button
              onClick={handleGenerateSkill}
              disabled={isGenerating || !generatePrompt.trim()}
              className="absolute right-1.5 top-1.5 p-1 rounded-md text-indigo-600 hover:bg-slate-200 transition-colors disabled:opacity-50"
              title="大模型一键生成 Skill"
            >
              <Sparkles className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Global actions */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowSettingsModal(true)}
            className="flex items-center space-x-1.5 px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg font-medium transition-all"
            title="配置 LLM 接口凭证与模型型号"
          >
            <Settings className="h-4 w-4 text-slate-500" />
            <span>模型配置</span>
          </button>

          <button
            onClick={handleCreateNewSkillBlank}
            className="flex items-center space-x-1.5 px-4 py-2 text-sm bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg font-medium transition-all"
          >
            <Plus className="h-4 w-4 text-indigo-500" />
            <span>新建空 Skill</span>
          </button>
          
          <a
            href="https://ai.studio/build"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-slate-400 hover:text-slate-600 flex items-center space-x-1"
          >
            <span>AI Studio</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Sidebar: Skill大纲 + 级联树 */}
        <aside className="w-80 bg-white border-r border-slate-200/80 flex flex-col shrink-0 overflow-y-auto">
          {/* Section: Filter Search */}
          <div className="p-4 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="搜索已有 Skill..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Section: Category Tree */}
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
                <Layers className="h-3.5 w-3.5 text-slate-400" />
                <span>标准分类大纲</span>
              </span>
              <button
                onClick={() => {
                  setNewCatLevel(1);
                  setNewCatParentId("");
                  setShowAddCategoryModal(true);
                }}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center space-x-1"
              >
                <FolderPlus className="h-3.5 w-3.5" />
                <span>新建</span>
              </button>
            </div>

            <div className="space-y-1 text-sm text-slate-600">
              <div
                className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                  !selectedCategory ? "bg-indigo-50 text-indigo-700 font-medium" : "hover:bg-slate-50"
                }`}
                onClick={() => {
                  setSelectedCategory(null);
                  setSelectedTag(null);
                }}
              >
                <span className="flex items-center space-x-2">
                  <BookOpen className="h-4 w-4 text-slate-400" />
                  <span>全部技能资产</span>
                </span>
                <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                  {skills.length}
                </span>
              </div>

              {/* Recursive render tree (Simple 2 levels for premium visualization) */}
              {buildTaxonomyTree().map((cat) => (
                <div key={cat.id} className="mt-1">
                  <div
                    className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                      selectedCategory === cat.name ? "bg-indigo-50 text-indigo-700 font-medium" : "hover:bg-slate-50"
                    }`}
                    onClick={() => {
                      setSelectedCategory(cat.name);
                      setSelectedTag(null);
                    }}
                  >
                    <span className="font-medium flex items-center space-x-1.5 pl-2">
                      <ChevronRight className={`h-3.5 w-3.5 text-slate-400 transform transition-transform ${selectedCategory === cat.name ? "rotate-90 text-indigo-500" : ""}`} />
                      <span>{cat.name}</span>
                    </span>
                    <span className="text-xs bg-indigo-50/50 text-indigo-600 px-1.5 py-0.5 rounded-sm font-mono">
                      {cat.count}
                    </span>
                  </div>

                  {/* Level 2 child nodes */}
                  {selectedCategory === cat.name && cat.children && (
                    <div className="pl-6 space-y-0.5 mt-1 border-l border-slate-100 ml-4">
                      {cat.children.map((sub) => (
                        <div
                          key={sub.id}
                          className="flex items-center justify-between p-1.5 rounded-md cursor-pointer hover:bg-slate-50 text-xs transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCategory(sub.name);
                          }}
                        >
                          <span className="text-slate-500 hover:text-indigo-600 flex items-center space-x-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-300"></span>
                            <span>{sub.name}</span>
                          </span>
                          <span className="text-slate-400 font-mono text-[10px]">
                            {sub.count || 0}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Section: Matching Skills List under selected category */}
          <div className="p-4 border-b border-slate-100 flex flex-col min-h-[250px] max-h-[350px]">
            <div className="flex items-center justify-between mb-3 shrink-0">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1">
                <FileCode className="h-3.5 w-3.5 text-indigo-500" />
                <span>关联 Skill 列表 ({skills.length})</span>
              </span>
              {selectedCategory && (
                <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-md font-medium truncate max-w-[120px]" title={selectedCategory}>
                  {selectedCategory}
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 min-h-0">
              {skills.length > 0 ? (
                skills.map((s) => (
                  <div
                    key={s.id}
                    className={`group flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-all border ${
                      currentSkill?.id === s.id
                        ? "bg-indigo-50/70 border-indigo-200 text-indigo-900 shadow-xs"
                        : "bg-slate-50/50 hover:bg-slate-100/75 border-slate-100 text-slate-700"
                    }`}
                    onClick={() => {
                      setCurrentSkill(s);
                      setActiveTab("edit");
                    }}
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex items-center space-x-1.5">
                        <span className={`text-xs font-semibold truncate ${currentSkill?.id === s.id ? "text-indigo-800" : "text-slate-800"}`}>
                          {s.name}
                        </span>
                        <span className="text-[9px] font-mono text-slate-400 bg-white border border-slate-200 px-1 py-0.2 rounded-xs shrink-0">
                          v{s.version}
                        </span>
                      </div>
                      {s.description && (
                        <p className="text-[10px] text-slate-400 truncate mt-0.5 leading-tight">
                          {s.description}
                        </p>
                      )}
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSkill(s.id);
                      }}
                      className="text-slate-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-all p-1 rounded hover:bg-rose-100/50 shrink-0"
                      title="删除该 Skill"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-xs text-slate-400 italic">
                  当前分类下暂无技能。点击上方“一键生成”或“新建空 Skill”来创建一个吧！
                </div>
              )}
            </div>
          </div>

          {/* Section: Tags */}
          {allTags.length > 0 && (
            <div className="p-4 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1 mb-2">
                <Tag className="h-3.5 w-3.5 text-slate-400" />
                <span>流行标签</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {allTags.map((t) => (
                  <button
                    key={t}
                    onClick={() => setSelectedTag(selectedTag === t ? null : t)}
                    className={`text-xs px-2.5 py-1 rounded-full transition-all border ${
                      selectedTag === t
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200"
                    }`}
                  >
                    #{t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Section: Active Skill Outline Nav */}
          {currentSkill && (
            <div className="p-4 flex-1 flex flex-col justify-end">
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                <div className="flex items-center space-x-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  <Activity className="h-3.5 w-3.5 text-indigo-500" />
                  <span>当前 Skill 质检状态</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-600">DOD 审计状态:</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold font-mono ${
                    currentSkill.dod_status === "PASSED"
                      ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                      : currentSkill.dod_status === "FAILED"
                      ? "bg-rose-50 text-rose-600 border border-rose-200"
                      : "bg-amber-50 text-amber-600 border border-amber-200"
                  }`}>
                    {currentSkill.dod_status === "PASSED" ? "✓ PASSED" : currentSkill.dod_status === "FAILED" ? "✗ FAILED" : "? UNCHECKED"}
                  </span>
                </div>
                {currentSkill.dod_report?.issues && currentSkill.dod_report.issues.length > 0 && (
                  <div className="mt-2 text-xs text-slate-400 border-t border-slate-200/50 pt-2 max-h-24 overflow-y-auto space-y-1">
                    {currentSkill.dod_report.issues.map((iss, idx) => (
                      <div key={idx} className="flex items-start space-x-1 text-[11px] leading-tight text-slate-500">
                        <AlertTriangle className={`h-3 w-3 mt-0.5 shrink-0 ${iss.type === "error" ? "text-rose-500" : "text-amber-500"}`} />
                        <span>{iss.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>

        {/* Middle Section: Active Workboard */}
        <main className="flex-1 bg-slate-50/50 flex flex-col overflow-y-auto">
          {/* Dynamic tabs bar */}
          <div className="bg-white border-b border-slate-200/80 px-6 py-2 flex items-center justify-between sticky top-0 z-30">
            <div className="flex space-x-1">
              <button
                onClick={() => setActiveTab("edit")}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-all ${
                  activeTab === "edit"
                    ? "border-indigo-600 text-indigo-600 font-semibold"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                📝 配置与编写
              </button>
              <button
                onClick={() => {
                  if (currentSkill) {
                    setMdPreviewText(generateMarkdownString(currentSkill));
                  }
                  setActiveTab("preview");
                }}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-all ${
                  activeTab === "preview"
                    ? "border-indigo-600 text-indigo-600 font-semibold"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                👁️ Markdown 源码预览
              </button>
              <button
                onClick={() => setActiveTab("simulate")}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-all ${
                  activeTab === "simulate"
                    ? "border-indigo-600 text-indigo-600 font-semibold"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                🧪 LLM 运行沙盒
              </button>
            </div>

            {/* Quick functional tools */}
            {currentSkill && (
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleSaveSkill()}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs font-medium transition-colors"
                >
                  <Save className="h-3.5 w-3.5 text-indigo-500" />
                  <span>保存草稿</span>
                </button>
                <button
                  onClick={handleCheckDOD}
                  disabled={isCheckingDOD}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
                >
                  <CheckCircle className="h-3.5 w-3.5 text-indigo-500" />
                  <span>{isCheckingDOD ? "质检审计中..." : "DOD 质量检查"}</span>
                </button>
                <button
                  onClick={() => handleExportSingleMD(currentSkill)}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-xs font-medium transition-colors"
                >
                  <Download className="h-3.5 w-3.5 text-indigo-300" />
                  <span>导出 MD</span>
                </button>
                <button
                  onClick={() => handleDeleteSkill(currentSkill.id)}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-md text-xs font-medium transition-colors border border-rose-100"
                  title="彻底删除此 Skill 模板"
                >
                  <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                  <span>删除 Skill</span>
                </button>
              </div>
            )}
          </div>

          <div className="p-6 max-w-4xl mx-auto w-full space-y-6">
            
            {/* Multi-select bar */}
            {bulkSelectIds.length > 0 && (
              <div className="bg-indigo-600 text-white rounded-xl p-4 flex items-center justify-between shadow-lg">
                <span className="text-sm font-medium">已选中 {bulkSelectIds.length} 个 Skill 模型资产</span>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setShowBulkCategoryModal(true)}
                    className="bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  >
                    批量修改分类
                  </button>
                  <button
                    onClick={handleBatchExportZIP}
                    className="bg-white text-indigo-700 hover:bg-slate-50 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center space-x-1"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>打包导出 (.zip)</span>
                  </button>
                  <button
                    onClick={() => setBulkSelectIds([])}
                    className="text-white/80 hover:text-white px-2 text-xs"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}

            {/* Content view according to tabs */}
            {currentSkill ? (
              <AnimatePresence mode="wait">
                {activeTab === "edit" && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-6"
                  >
                    {/* 1. Skill basic config info */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <h3 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
                          <BookMarked className="h-4 w-4 text-indigo-500" />
                          <span>基本配置信息与分类属性</span>
                        </h3>
                        <div className="flex items-center space-x-2 text-xs text-slate-400">
                          <label className="flex items-center space-x-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={bulkSelectIds.includes(currentSkill.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setBulkSelectIds(prev => [...prev, currentSkill.id]);
                                } else {
                                  setBulkSelectIds(prev => prev.filter(id => id !== currentSkill.id));
                                }
                              }}
                              className="rounded-md text-indigo-600 focus:ring-indigo-500"
                            />
                            <span>加入批量操作队列</span>
                          </label>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-500">Skill 命名</label>
                          <input
                            type="text"
                            value={currentSkill.name}
                            onChange={(e) => setCurrentSkill({ ...currentSkill, name: e.target.value })}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-500">版本号</label>
                          <input
                            type="text"
                            value={currentSkill.version}
                            onChange={(e) => setCurrentSkill({ ...currentSkill, version: e.target.value })}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-500">作者 / 开发团队</label>
                          <input
                            type="text"
                            value={currentSkill.author}
                            onChange={(e) => setCurrentSkill({ ...currentSkill, author: e.target.value })}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-500">一句话业务描述（Description）</label>
                        <input
                          type="text"
                          value={currentSkill.description}
                          onChange={(e) => setCurrentSkill({ ...currentSkill, description: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>

                      {/* Cascade category selector */}
                      <div className="border-t border-slate-100 pt-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-500">技能所属级联分类大纲</span>
                          <button
                            onClick={() => {
                              const promptText = `请帮我自动推荐并润色以下 Skill 的最佳分类层级和流行 Tags：\n名称: "${currentSkill.name}"\n描述: "${currentSkill.description}"\n\n请在右侧 Assistant 中给出最终推荐分类！`;
                              setChatInput(promptText);
                              showNotification("💡 提示：在右侧点击发送即可获取推荐");
                            }}
                            className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center space-x-1"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            <span>AI 智能分类推荐</span>
                          </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <span className="text-[11px] text-slate-400">一级分类</span>
                            <select
                              value={currentSkill.taxonomy?.primary_category || ""}
                              onChange={(e) => {
                                const newTax: Taxonomy = {
                                  ...currentSkill.taxonomy,
                                  primary_category: e.target.value,
                                  category_tree: [e.target.value, currentSkill.taxonomy.secondary_category, currentSkill.taxonomy.tertiary_category].filter(Boolean)
                                };
                                setCurrentSkill({ ...currentSkill, taxonomy: newTax });
                              }}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500/20"
                            >
                              <option value="">-- 请选择 --</option>
                              {taxonomyNodes.filter(n => n.level === 1).map(n => (
                                <option key={n.id} value={n.name}>{n.name}</option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-1">
                            <span className="text-[11px] text-slate-400">二级分类</span>
                            <select
                              value={currentSkill.taxonomy?.secondary_category || ""}
                              onChange={(e) => {
                                const newTax: Taxonomy = {
                                  ...currentSkill.taxonomy,
                                  secondary_category: e.target.value,
                                  category_tree: [currentSkill.taxonomy.primary_category, e.target.value, currentSkill.taxonomy.tertiary_category].filter(Boolean)
                                };
                                setCurrentSkill({ ...currentSkill, taxonomy: newTax });
                              }}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500/20"
                            >
                              <option value="">-- 请选择 --</option>
                              {taxonomyNodes.filter(n => n.level === 2).map(n => (
                                <option key={n.id} value={n.name}>{n.name}</option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-1">
                            <span className="text-[11px] text-slate-400">三级细分</span>
                            <input
                              type="text"
                              value={currentSkill.taxonomy?.tertiary_category || ""}
                              placeholder="例如：实时天气/性能调优"
                              onChange={(e) => {
                                const newTax: Taxonomy = {
                                  ...currentSkill.taxonomy,
                                  tertiary_category: e.target.value,
                                  category_tree: [currentSkill.taxonomy.primary_category, currentSkill.taxonomy.secondary_category, e.target.value].filter(Boolean)
                                };
                                setCurrentSkill({ ...currentSkill, taxonomy: newTax });
                              }}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500/20"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Attributes & Custom Tags */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-slate-500">分类属性指标</label>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="text-[10px] text-slate-400 block mb-1">困难等级</span>
                              <select
                                value={currentSkill.taxonomy?.classification_attrs?.difficulty_level || DifficultyLevel.BEGINNER}
                                onChange={(e) => {
                                  const updated = { ...currentSkill };
                                  updated.taxonomy.classification_attrs.difficulty_level = e.target.value as DifficultyLevel;
                                  setCurrentSkill(updated);
                                }}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs"
                              >
                                <option value={DifficultyLevel.BEGINNER}>初学者 (Beginner)</option>
                                <option value={DifficultyLevel.INTERMEDIATE}>中级 (Intermediate)</option>
                                <option value={DifficultyLevel.ADVANCED}>资深 (Advanced)</option>
                              </select>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block mb-1">执行模式</span>
                              <select
                                value={currentSkill.taxonomy?.classification_attrs?.execution_mode || ExecutionMode.SYNC}
                                onChange={(e) => {
                                  const updated = { ...currentSkill };
                                  updated.taxonomy.classification_attrs.execution_mode = e.target.value as ExecutionMode;
                                  setCurrentSkill(updated);
                                }}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs"
                              >
                                <option value={ExecutionMode.SYNC}>同步阻塞 (Sync)</option>
                                <option value={ExecutionMode.ASYNC}>异步回调 (Async)</option>
                                <option value={ExecutionMode.STREAMING}>流式响应 (Streaming)</option>
                              </select>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-slate-500">自定义标签 (逗号分隔)</label>
                          <input
                            type="text"
                            placeholder="如：金融, 实时, 高并发, 提示词"
                            value={currentSkill.taxonomy?.tags?.join(", ") || ""}
                            onChange={(e) => {
                              const tagList = e.target.value.split(",").map(t => t.trim()).filter(Boolean);
                              const updated = { ...currentSkill };
                              updated.taxonomy.tags = tagList;
                              setCurrentSkill(updated);
                            }}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                      </div>
                    </div>

                    {/* 2. 主题定义 (Goals and Boundaries) */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <h3 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
                          <FileText className="h-4 w-4 text-indigo-500" />
                          <span>🎯 主题定义与业务边界</span>
                        </h3>
                        <button
                          onClick={() => handleOptimizeSection("topic", "请扩充并优化该主题定义，让目标和限制边界更加科学、严谨")}
                          disabled={isOptimizing === "topic"}
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center space-x-1"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          <span>{isOptimizing === "topic" ? "自动润色中..." : "一键重写重构"}</span>
                        </button>
                      </div>

                      <div className="space-y-3">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-500">主旨目标 (Goal)</label>
                          <textarea
                            rows={2}
                            value={currentSkill.topic?.goal || ""}
                            onChange={(e) => {
                              const updated = { ...currentSkill };
                              updated.topic.goal = e.target.value;
                              setCurrentSkill(updated);
                            }}
                            placeholder="如：帮助用户快速获取目标城市的实时天气、未来三天预报及个性化出行建议。"
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-500">业务作用范围与限制 (Scope)</label>
                          <textarea
                            rows={2}
                            value={currentSkill.topic?.scope || ""}
                            onChange={(e) => {
                              const updated = { ...currentSkill };
                              updated.topic.scope = e.target.value;
                              setCurrentSkill(updated);
                            }}
                            placeholder="如：国内所有地级市及国外核心热门城市，不包含乡镇等微型气象区。"
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                      </div>
                    </div>

                    {/* 3. 核心提示词与模板 (Core System and User Prompts) */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <h3 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
                          <Code className="h-4 w-4 text-indigo-500" />
                          <span>📝 核心提示词内容 (Prompts)</span>
                        </h3>
                        <button
                          onClick={() => handleOptimizeSection("content", "强化系统提示词的鲁棒性，补充格式限定，增加幻觉防御机制。")}
                          disabled={isOptimizing === "content"}
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center space-x-1"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          <span>{isOptimizing === "content" ? "提示词深度调优中..." : "大模型深度调优提示词"}</span>
                        </button>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-semibold text-slate-500">1. 系统指令（System Prompt - 角色与规则定义）</label>
                            <span className="text-[10px] text-slate-400 font-mono">
                              字符长度: {currentSkill.content?.system_prompt?.length || 0}
                            </span>
                          </div>
                          <textarea
                            rows={6}
                            value={currentSkill.content?.system_prompt || ""}
                            onChange={(e) => {
                              const updated = { ...currentSkill };
                              updated.content.system_prompt = e.target.value;
                              setCurrentSkill(updated);
                            }}
                            placeholder="定义大模型的角色、逻辑推导过程、格式约束。例如：你是一个专业的天气助手..."
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs font-mono focus:ring-2 focus:ring-indigo-500/20 leading-relaxed"
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-semibold text-slate-500">2. 用户提示词模板（User Prompt Template）</label>
                            <span className="text-[10px] text-indigo-500 font-medium font-mono">
                              检测到参数: {extractVariables(currentSkill.content?.prompt || "").map(v => `{{${v}}}`).join(", ") || "无参数"}
                            </span>
                          </div>
                          <textarea
                            rows={3}
                            value={currentSkill.content?.prompt || ""}
                            onChange={(e) => {
                              const updated = { ...currentSkill };
                              updated.content.prompt = e.target.value;
                              setCurrentSkill(updated);
                            }}
                            placeholder="提示词模板，支持使用双花括号包裹变量，如：查询城市为 {{city}}，时间为 {{date}}。"
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs font-mono focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                      </div>
                    </div>

                    {/* 4. 执行步骤 (Steps) */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <h3 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
                          <Layers className="h-4 w-4 text-indigo-500" />
                          <span>🔄 执行步骤划分（Workflow Steps）</span>
                        </h3>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleOptimizeSection("steps", "请根据当前系统提示词，补充合理的流水线逻辑，生成 2-4 个精细化步骤")}
                            disabled={isOptimizing === "steps"}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center space-x-1"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            <span>自动拆解步骤</span>
                          </button>
                          <button
                            onClick={() => {
                              const updated = { ...currentSkill };
                              const newStep: SkillStep = {
                                id: `step-${Date.now()}`,
                                name: `新步骤`,
                                description: `该步骤处理的核心逻辑`,
                                pre_condition: "输入有效",
                                timeout_ms: 1000,
                                error_handling: "抛出异常并降级"
                              };
                              updated.steps.push(newStep);
                              setCurrentSkill(updated);
                            }}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center space-x-1"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            <span>新增</span>
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {currentSkill.steps?.length > 0 ? (
                          currentSkill.steps.map((step, idx) => (
                            <div key={step.id} className="p-4 bg-slate-50 border border-slate-200/60 rounded-xl space-y-3 relative group">
                              <button
                                onClick={() => {
                                  const updated = { ...currentSkill };
                                  updated.steps = updated.steps.filter(s => s.id !== step.id);
                                  setCurrentSkill(updated);
                                }}
                                className="absolute top-3 right-3 text-slate-400 hover:text-rose-500 transition-colors"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                  <span className="text-[10px] text-slate-400 font-bold uppercase">步骤 {idx + 1} 名称</span>
                                  <input
                                    type="text"
                                    value={step.name}
                                    onChange={(e) => {
                                      const updated = { ...currentSkill };
                                      updated.steps[idx].name = e.target.value;
                                      setCurrentSkill(updated);
                                    }}
                                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold"
                                  />
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 font-bold uppercase">前置必要条件</span>
                                  <input
                                    type="text"
                                    value={step.pre_condition}
                                    onChange={(e) => {
                                      const updated = { ...currentSkill };
                                      updated.steps[idx].pre_condition = e.target.value;
                                      setCurrentSkill(updated);
                                    }}
                                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="md:col-span-2">
                                  <span className="text-[10px] text-slate-400 block mb-1 font-bold">核心描述</span>
                                  <input
                                    type="text"
                                    value={step.description}
                                    onChange={(e) => {
                                      const updated = { ...currentSkill };
                                      updated.steps[idx].description = e.target.value;
                                      setCurrentSkill(updated);
                                    }}
                                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs"
                                  />
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 block mb-1 font-bold">限时超时时间 (ms)</span>
                                  <input
                                    type="number"
                                    value={step.timeout_ms}
                                    onChange={(e) => {
                                      const updated = { ...currentSkill };
                                      updated.steps[idx].timeout_ms = parseInt(e.target.value) || 1000;
                                      setCurrentSkill(updated);
                                    }}
                                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-mono"
                                  />
                                </div>
                              </div>

                              <div>
                                <span className="text-[10px] text-slate-400 block mb-0.5 font-bold">异常与超时处理预案 (Exception Handling)</span>
                                <input
                                  type="text"
                                  value={step.error_handling}
                                  onChange={(e) => {
                                    const updated = { ...currentSkill };
                                    updated.steps[idx].error_handling = e.target.value;
                                    setCurrentSkill(updated);
                                  }}
                                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-600"
                                />
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-6 text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50">
                            当前 Skill 没有声明具体的执行步骤，您可以点击右上方“自动拆解步骤”由 AI 填充。
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 5. 检查规范 (Validation Checks) */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <h3 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
                          <CheckCircle className="h-4 w-4 text-indigo-500" />
                          <span>✅ 审计检查规范（Checks / DOD Rules）</span>
                        </h3>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleOptimizeSection("checks", "请分析系统提示词的薄弱环节，自动建立 2-4 个关于内容格式、防爆、防注入的安全检查指标。")}
                            disabled={isOptimizing === "checks"}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center space-x-1"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            <span>生成防御指标</span>
                          </button>
                          <button
                            onClick={() => {
                              const updated = { ...currentSkill };
                              const newCheck: SkillCheck = {
                                id: `chk-${Date.now()}`,
                                name: "新指标检查项",
                                rule: "具体限制审查规则内容",
                                severity: "Warning"
                              };
                              updated.checks.push(newCheck);
                              setCurrentSkill(updated);
                            }}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center space-x-1"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            <span>新增</span>
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {currentSkill.checks?.length > 0 ? (
                          currentSkill.checks.map((chk, idx) => (
                            <div key={chk.id} className="flex items-center space-x-2 bg-slate-50 border border-slate-200/60 p-2.5 rounded-lg text-xs relative group">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 flex-1">
                                <input
                                  type="text"
                                  value={chk.name}
                                  onChange={(e) => {
                                    const updated = { ...currentSkill };
                                    updated.checks[idx].name = e.target.value;
                                    setCurrentSkill(updated);
                                  }}
                                  className="bg-white border border-slate-200 rounded-md px-2 py-1 font-semibold"
                                  placeholder="指标名称"
                                />
                                <input
                                  type="text"
                                  value={chk.rule}
                                  onChange={(e) => {
                                    const updated = { ...currentSkill };
                                    updated.checks[idx].rule = e.target.value;
                                    setCurrentSkill(updated);
                                  }}
                                  className="bg-white border border-slate-200 rounded-md px-2 py-1 md:col-span-1"
                                  placeholder="验证规则"
                                />
                                <select
                                  value={chk.severity}
                                  onChange={(e) => {
                                    const updated = { ...currentSkill };
                                    updated.checks[idx].severity = e.target.value as "Error" | "Warning";
                                    setCurrentSkill(updated);
                                  }}
                                  className="bg-white border border-slate-200 rounded-md px-2 py-1"
                                >
                                  <option value="Error">阻断性异常 (Error)</option>
                                  <option value="Warning">非阻断警报 (Warning)</option>
                                </select>
                              </div>
                              <button
                                onClick={() => {
                                  const updated = { ...currentSkill };
                                  updated.checks = updated.checks.filter(c => c.id !== chk.id);
                                  setCurrentSkill(updated);
                                }}
                                className="text-slate-400 hover:text-rose-500 transition-colors shrink-0"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-6 text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50">
                            未设定特定验证指标，建议点击上方“生成防御指标”添加，提高模型输出准度。
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 6. 执行示例 (Examples) */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <h3 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
                          <FileCode className="h-4 w-4 text-indigo-500" />
                          <span>📊 优秀效果执行示例（Few-Shot Examples）</span>
                        </h3>
                        <button
                          onClick={() => {
                            const updated = { ...currentSkill };
                            const newEx: SkillExample = {
                              id: `ex-${Date.now()}`,
                              input: "示例输入内容",
                              output: "示例模型期望回答"
                            };
                            updated.examples.push(newEx);
                            setCurrentSkill(updated);
                          }}
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center space-x-1"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>新增示例</span>
                        </button>
                      </div>

                      <div className="space-y-4">
                        {currentSkill.examples?.length > 0 ? (
                          currentSkill.examples.map((ex, idx) => (
                            <div key={ex.id} className="p-4 bg-slate-50 border border-slate-200/60 rounded-xl space-y-2 relative">
                              <button
                                onClick={() => {
                                  const updated = { ...currentSkill };
                                  updated.examples = updated.examples.filter(e => e.id !== ex.id);
                                  setCurrentSkill(updated);
                                }}
                                className="absolute top-2 right-2 text-slate-400 hover:text-rose-500"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                              
                              <div className="space-y-1">
                                <span className="text-[10px] text-slate-400 font-bold">示例 {idx + 1} 录入参数/输入</span>
                                <textarea
                                  rows={2}
                                  value={ex.input}
                                  onChange={(e) => {
                                    const updated = { ...currentSkill };
                                    updated.examples[idx].input = e.target.value;
                                    setCurrentSkill(updated);
                                  }}
                                  className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-mono"
                                />
                              </div>

                              <div className="space-y-1">
                                <span className="text-[10px] text-slate-400 font-bold">期望输出 (大模型推理结果)</span>
                                <textarea
                                  rows={2}
                                  value={ex.output}
                                  onChange={(e) => {
                                    const updated = { ...currentSkill };
                                    updated.examples[idx].output = e.target.value;
                                    setCurrentSkill(updated);
                                  }}
                                  className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-mono text-slate-600"
                                />
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-6 text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50">
                            暂无 Few-Shot 示例
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Markdown preview tab */}
                {activeTab === "preview" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4"
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <h3 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
                        <Eye className="h-4 w-4 text-indigo-500" />
                        <span>自动解析生成的 Markdown 报告与 YAML Front Matter</span>
                      </h3>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => copyToClipboard(mdPreviewText)}
                          className="flex items-center space-x-1 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs font-medium"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          <span>复制代码</span>
                        </button>
                        <button
                          onClick={() => downloadMarkdownFile(`${currentSkill.name}.md`, mdPreviewText)}
                          className="flex items-center space-x-1 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-xs font-medium"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>下载 .md</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-[650px]">
                      <div className="bg-slate-900 text-slate-200 rounded-xl p-4 font-mono text-xs overflow-y-auto whitespace-pre leading-relaxed border border-slate-800 shadow-inner">
                        {mdPreviewText}
                      </div>
                      <div className="bg-slate-50 rounded-xl p-6 overflow-y-auto border border-slate-200/60 shadow-inner prose prose-slate max-w-none text-xs">
                        <Markdown>{mdPreviewText}</Markdown>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Simulation tab */}
                {activeTab === "simulate" && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4"
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <h3 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
                        <Play className="h-4 w-4 text-indigo-500" />
                        <span>🧪 真实大模型运行仿真沙盒</span>
                      </h3>
                      <span className="text-xs text-slate-400">结合您配置的系统提示词，实时填充参数后提交验证。</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="md:col-span-1 space-y-4 border-r border-slate-100 pr-4">
                        <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                          输入参数赋值
                        </h4>
                        
                        {Object.keys(simInputs).length > 0 ? (
                          Object.keys(simInputs).map((key) => (
                            <div key={key} className="space-y-1">
                              <span className="text-xs font-medium text-slate-600 font-mono">
                                {"{{"} {key} {"}}"}
                              </span>
                              <textarea
                                value={simInputs[key]}
                                onChange={(e) => setSimInputs({ ...simInputs, [key]: e.target.value })}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs focus:ring-2 focus:ring-indigo-500/20"
                                rows={2}
                                placeholder={`输入 ${key} 的测试值...`}
                              />
                            </div>
                          ))
                        ) : (
                          <div className="text-xs text-slate-400 py-4 bg-slate-50 border border-dashed rounded-lg text-center">
                            未在用户模板中检测到参数。请在“用户提示词”中加入形如 {"{{city}}"} 的插值变量。
                          </div>
                        )}

                        <button
                          onClick={handleRunSimulation}
                          disabled={isSimulating}
                          className="w-full flex items-center justify-center space-x-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-all"
                        >
                          {isSimulating ? (
                            <>
                              <RotateCcw className="h-4 w-4 animate-spin" />
                              <span>大模型正在推理中...</span>
                            </>
                          ) : (
                            <>
                              <Play className="h-4 w-4" />
                              <span>一键真实运行仿真</span>
                            </>
                          )}
                        </button>
                      </div>

                      <div className="md:col-span-2 space-y-4">
                        <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex justify-between">
                          <span>推理结果输出</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            模式: {process.env.GEMINI_API_KEY ? "在线 Gemini API" : "离线本拟渲染"}
                          </span>
                        </h4>

                        <div className="min-h-[300px] max-h-[500px] bg-slate-900 text-slate-100 p-5 rounded-xl font-mono text-xs overflow-y-auto border border-slate-800 shadow-inner">
                          {isSimulating ? (
                            <div className="flex flex-col items-center justify-center h-48 space-y-2 text-slate-500">
                              <RotateCcw className="h-6 w-6 animate-spin text-indigo-500" />
                              <span>模型正依据系统提示词逻辑处理请求，请耐心等待 2-5 秒...</span>
                            </div>
                          ) : simOutput ? (
                            <div className="prose prose-invert prose-slate max-w-none text-xs">
                              <Markdown>{simOutput}</Markdown>
                            </div>
                          ) : (
                            <span className="text-slate-500 italic">在左侧输入测试变量的值，并点击“一键真实运行仿真”按钮。生成的返回信息将在此处流式渲染并支持格式展示。</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center bg-white border border-slate-200 rounded-2xl p-8 space-y-4 shadow-xs">
                <Layout className="h-12 w-12 text-slate-300" />
                <div>
                  <h3 className="text-slate-800 font-bold">暂无选中的 Skill 模板</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    系统内置了一套分类完整的库，您可以点击左侧栏切换，或使用顶部输入框生成一个全新的技能！
                  </p>
                </div>
                <button
                  onClick={handleCreateNewSkillBlank}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                >
                  创建我的第一个 Skill 模板
                </button>
              </div>
            )}
          </div>
        </main>

        {/* Right Sidebar: AI Architect Refinement Chat */}
        <aside className="w-80 bg-white border-l border-slate-200/80 flex flex-col shrink-0">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
              <Sparkles className="h-4 w-4 text-indigo-500" />
              <span>Skill 架构专家助理</span>
            </span>
            <span className="h-2 w-2 rounded-full bg-emerald-500" title="AI 在线"></span>
          </div>

          {/* Quick Guidance / Action Panel */}
          {currentSkill && (
            <div className="p-3 bg-slate-50/50 border-b border-slate-100 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 block uppercase px-1">
                快捷协助指引 (Quick Edits)
              </span>
              <div className="grid grid-cols-1 gap-1">
                <button
                  onClick={() => {
                    const req = `请仔细审查当前这个名为「${currentSkill.name}」的 Skill 提示词和完整配置，指出有哪些不符合 Definition of Done (DOD) 指标的安全缺陷（如：注入防御、参数合法校验等），并且告诉我应该如何修改。`;
                    setChatInput(req);
                  }}
                  className="text-left text-[11px] bg-white border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/25 p-1.5 rounded-md text-slate-600 transition-all font-medium leading-tight truncate"
                >
                  🔍 寻找当前防注入及质量漏洞
                </button>
                <button
                  onClick={() => {
                    const req = `我想给这个 Skill 增加一些新的严格校验（Checks）。请根据其定义，帮我写 3 个高质量的 Checks JSON，以便让我可以添加到 checks 字段中。`;
                    setChatInput(req);
                  }}
                  className="text-left text-[11px] bg-white border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/25 p-1.5 rounded-md text-slate-600 transition-all font-medium leading-tight truncate"
                >
                  🛡️ 推荐 3 个专用的安全阻断器 (Checks)
                </button>
                <button
                  onClick={() => {
                    const req = `请帮我设计两个针对这个 Skill 场景的真实输入输出 Example 示例，包含具体测试数据，以便让我添加。`;
                    setChatInput(req);
                  }}
                  className="text-left text-[11px] bg-white border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/25 p-1.5 rounded-md text-slate-600 transition-all font-medium leading-tight truncate"
                >
                  📊 推荐两个优质 Example 案例数据
                </button>
              </div>
            </div>
          )}

          {/* Chat message logs */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3">
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className={`flex flex-col max-w-[90%] ${
                  msg.role === "user" ? "ml-auto items-end" : "mr-auto items-start"
                }`}
              >
                <span className="text-[9px] text-slate-400 font-mono mb-0.5">
                  {msg.role === "user" ? "我" : "AI 架构师"}
                </span>
                <div
                  className={`p-2.5 rounded-xl text-xs leading-relaxed ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white rounded-tr-none shadow-xs"
                      : "bg-slate-100 text-slate-700 rounded-tl-none border border-slate-200/50"
                  }`}
                >
                  <Markdown>{msg.content}</Markdown>
                </div>
              </div>
            ))}
            {isChatLoading && (
              <div className="flex items-center space-x-1.5 text-slate-400 text-xs py-2 pl-2">
                <RotateCcw className="h-3 w-3 animate-spin text-indigo-500" />
                <span className="italic font-light">架构顾问正在编写方案...</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input control chat */}
          <div className="p-3 border-t border-slate-100 bg-slate-50">
            <div className="relative">
              <input
                type="text"
                placeholder={currentSkill ? "输入反馈指令...（如：加个超时预案）" : "选择左侧 Skill 后即可开始协同对话"}
                disabled={!currentSkill || isChatLoading}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
                className="w-full bg-white border border-slate-200 rounded-lg pl-3 pr-10 py-2 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-inner"
              />
              <button
                onClick={handleSendChat}
                disabled={!currentSkill || isChatLoading || !chatInput.trim()}
                className="absolute right-1.5 top-1.5 p-1 rounded-md text-indigo-600 hover:bg-slate-100 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* MODAL 1: Add Taxonomy node */}
      {showAddCategoryModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl space-y-4">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">创建新级联分类节点</h3>
              <p className="text-xs text-slate-400 mt-1">扩展您的标准或行业特异性大纲树结构</p>
            </div>

            <div className="space-y-3">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 block mb-1">节点名称</span>
                <input
                  type="text"
                  placeholder="如：金融理财 / 并发性能审查"
                  className="w-full border rounded-lg px-3 py-2 text-xs"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                />
              </div>

              <div>
                <span className="text-[11px] font-semibold text-slate-500 block mb-1">层级等级</span>
                <select
                  value={newCatLevel}
                  onChange={(e) => setNewCatLevel(parseInt(e.target.value))}
                  className="w-full border rounded-lg px-2.5 py-1.5 text-xs bg-white"
                >
                  <option value={1}>一级顶层分类 (Level 1)</option>
                  <option value={2}>二级叶子子分类 (Level 2)</option>
                </select>
              </div>

              {newCatLevel === 2 && (
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 block mb-1">关联父级节点</span>
                  <select
                    value={newCatParentId}
                    onChange={(e) => setNewCatParentId(e.target.value)}
                    className="w-full border rounded-lg px-2.5 py-1.5 text-xs bg-white"
                  >
                    <option value="">-- 请选择父节点 --</option>
                    {taxonomyNodes.filter(n => n.level === 1).map(n => (
                      <option key={n.id} value={n.id}>{n.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowAddCategoryModal(false)}
                className="px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50 rounded-md"
              >
                取消
              </button>
              <button
                onClick={handleAddCategory}
                disabled={!newCatName.trim() || (newCatLevel === 2 && !newCatParentId)}
                className="px-3.5 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-medium disabled:opacity-50"
              >
                确认创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Batch classification update */}
      {showBulkCategoryModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl space-y-4">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">批量修改分类</h3>
              <p className="text-xs text-slate-400 mt-1">重置选中的 {bulkSelectIds.length} 个技能的分类归属</p>
            </div>

            <div className="space-y-3">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 block mb-1">一级分类</span>
                <select
                  value={bulkCategory.primary}
                  onChange={(e) => setBulkCategory({ ...bulkCategory, primary: e.target.value })}
                  className="w-full border rounded-lg p-2 text-xs"
                >
                  <option value="">保留原样</option>
                  {taxonomyNodes.filter(n => n.level === 1).map(n => (
                    <option key={n.id} value={n.name}>{n.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <span className="text-[11px] font-semibold text-slate-500 block mb-1">二级分类</span>
                <select
                  value={bulkCategory.secondary}
                  onChange={(e) => setBulkCategory({ ...bulkCategory, secondary: e.target.value })}
                  className="w-full border rounded-lg p-2 text-xs"
                >
                  <option value="">保留原样</option>
                  {taxonomyNodes.filter(n => n.level === 2).map(n => (
                    <option key={n.id} value={n.name}>{n.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowBulkCategoryModal(false)}
                className="px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50 rounded-md"
              >
                取消
              </button>
              <button
                onClick={handleBatchUpdateCategory}
                className="px-3.5 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-medium"
              >
                确认保存更改
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: MD Export configurations */}
      {showExportModal && currentSkill && (
        <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-2xl space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center">
                  <Download className="h-5 w-5 mr-1.5 text-indigo-600" />
                  <span>导出配置 & Markdown 编译设置</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">编译并打包为标准 YAML Front Matter + Markdown 文件</p>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-4 md:border-r border-slate-100 pr-4">
                <h4 className="text-xs font-bold text-slate-600 uppercase">属性开关</h4>
                
                <label className="flex items-center space-x-2.5 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exportOptions.includeExamples}
                    onChange={(e) => {
                      const opts = { ...exportOptions, includeExamples: e.target.checked };
                      setExportOptions(opts);
                      setMdPreviewText(generateMarkdownString(currentSkill, opts));
                    }}
                    className="rounded-md text-indigo-600"
                  />
                  <span>包含Few-shot执行示例</span>
                </label>

                <label className="flex items-center space-x-2.5 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exportOptions.includeDOD}
                    onChange={(e) => {
                      const opts = { ...exportOptions, includeDOD: e.target.checked };
                      setExportOptions(opts);
                      setMdPreviewText(generateMarkdownString(currentSkill, opts));
                    }}
                    className="rounded-md text-indigo-600"
                  />
                  <span>包含 QA/DOD 质检元数据</span>
                </label>

                <label className="flex items-center space-x-2.5 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exportOptions.minify}
                    onChange={(e) => {
                      const opts = { ...exportOptions, minify: e.target.checked };
                      setExportOptions(opts);
                      setMdPreviewText(generateMarkdownString(currentSkill, opts));
                    }}
                    className="rounded-md text-indigo-600"
                  />
                  <span>压缩冗余注释（精简版）</span>
                </label>

                <div className="pt-4 border-t border-slate-100 space-y-2">
                  <button
                    onClick={() => downloadMarkdownFile(`${currentSkill.name}.md`, mdPreviewText)}
                    className="w-full flex items-center justify-center space-x-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium"
                  >
                    <Download className="h-4 w-4" />
                    <span>立即下载 .md 文件</span>
                  </button>
                  <button
                    onClick={() => copyToClipboard(mdPreviewText)}
                    className="w-full flex items-center justify-center space-x-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium"
                  >
                    <Copy className="h-4 w-4" />
                    <span>复制到剪贴板</span>
                  </button>
                </div>
              </div>

              <div className="md:col-span-2 space-y-2">
                <h4 className="text-xs font-bold text-slate-600 uppercase">编译预览</h4>
                <div className="bg-slate-900 text-slate-200 p-4 rounded-xl font-mono text-[10px] h-[300px] overflow-y-auto leading-relaxed border border-slate-800">
                  {mdPreviewText}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Model Settings */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl space-y-4">
            <div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center">
                <Settings className="h-4.5 w-4.5 mr-1.5 text-slate-700" />
                <span>大模型参数配置</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                选择并配置您当前的工作大模型服务提供商。所有配置将持久化保存至本地 SQLite 数据库中。
              </p>
            </div>

            <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 block mb-1.5">当前使用大模型提供商 (Active Provider)</span>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, provider: "deepseek" })}
                    className={`flex items-center justify-center space-x-2 p-2.5 border rounded-xl text-xs font-medium transition-all ${
                      settings.provider === "deepseek"
                        ? "bg-indigo-50 border-indigo-500 text-indigo-700 ring-2 ring-indigo-500/10"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span>DeepSeek (默认优先)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, provider: "gemini" })}
                    className={`flex items-center justify-center space-x-2 p-2.5 border rounded-xl text-xs font-medium transition-all ${
                      settings.provider === "gemini"
                        ? "bg-indigo-50 border-indigo-500 text-indigo-700 ring-2 ring-indigo-500/10"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span>Google Gemini</span>
                  </button>
                </div>
              </div>

              {settings.provider === "deepseek" ? (
                <div className="space-y-3 p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                  <h4 className="text-xs font-bold text-slate-700 mb-1">DeepSeek 选项配置</h4>
                  
                  <div>
                    <span className="text-[11px] text-slate-500 block mb-1">DeepSeek API Key</span>
                    <input
                      type="password"
                      placeholder="sk-..."
                      className="w-full border rounded-lg px-3 py-1.5 text-xs bg-white focus:ring-1 focus:ring-indigo-500"
                      value={settings.deepseek_api_key}
                      onChange={(e) => setSettings({ ...settings, deepseek_api_key: e.target.value })}
                    />
                    <p className="text-[10px] text-slate-400 mt-1">若不配置，系统将默认回退到系统环境变量的 DEEPSEEK_API_KEY</p>
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-500 block mb-1">API Base URL</span>
                    <input
                      type="text"
                      placeholder="https://api.deepseek.com/v1"
                      className="w-full border rounded-lg px-3 py-1.5 text-xs bg-white focus:ring-1 focus:ring-indigo-500 font-mono"
                      value={settings.deepseek_base_url}
                      onChange={(e) => setSettings({ ...settings, deepseek_base_url: e.target.value })}
                    />
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-500 block mb-1">Model Name (模型标识码)</span>
                    <input
                      type="text"
                      placeholder="deepseek-chat"
                      className="w-full border rounded-lg px-3 py-1.5 text-xs bg-white focus:ring-1 focus:ring-indigo-500 font-mono"
                      value={settings.deepseek_model}
                      onChange={(e) => setSettings({ ...settings, deepseek_model: e.target.value })}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3 p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                  <h4 className="text-xs font-bold text-slate-700 mb-1">Gemini 选项配置</h4>

                  <div>
                    <span className="text-[11px] text-slate-500 block mb-1">Gemini API Key</span>
                    <input
                      type="password"
                      placeholder="AIzaSy..."
                      className="w-full border rounded-lg px-3 py-1.5 text-xs bg-white focus:ring-1 focus:ring-indigo-500"
                      value={settings.gemini_api_key}
                      onChange={(e) => setSettings({ ...settings, gemini_api_key: e.target.value })}
                    />
                    <p className="text-[10px] text-slate-400 mt-1">若不配置，系统将默认回退到系统环境变量的 GEMINI_API_KEY</p>
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-500 block mb-1">Model Name (模型版本)</span>
                    <input
                      type="text"
                      placeholder="gemini-3.5-flash"
                      disabled
                      className="w-full border rounded-lg px-3 py-1.5 text-xs bg-slate-100 text-slate-500 font-mono cursor-not-allowed"
                      value={settings.gemini_model}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowSettingsModal(false)}
                className="px-3.5 py-2 text-xs text-slate-500 hover:bg-slate-50 rounded-lg"
              >
                关闭
              </button>
              <button
                onClick={handleSaveSettings}
                disabled={isSavingSettings}
                className="px-4 py-2 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-all flex items-center space-x-1"
              >
                {isSavingSettings ? (
                  <span>保存中...</span>
                ) : (
                  <>
                    <Save className="h-3 w-3" />
                    <span>保存配置</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global alert notification */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50">
          <div className={`px-4 py-3 rounded-xl shadow-xl flex items-center space-x-2 text-xs font-medium border text-white ${
            notification.type === "success"
              ? "bg-emerald-600 border-emerald-500 shadow-emerald-200/50"
              : "bg-rose-600 border-rose-500 shadow-rose-200/50"
          }`}>
            <Check className="h-4 w-4" />
            <span>{notification.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}

# Upstream Adapter Compatibility 分析报告

> 基于各平台官方文档（唯一事实来源）和当前 adapter 代码逻辑的对比分析。
> 生成时间：2025-07

## 1. 总览

当前三个 adapter（Codex / Claude Code / Cursor）在 `computeCompatibility()` 中对各组件的兼容性评级：

| 组件 | Codex Adapter | Claude Adapter | Cursor Adapter |
|------|--------------|----------------|----------------|
| Skills | full | full | full |
| MCP Servers | full | full | full |
| Hooks | **partial** | **partial** | **partial** |
| Agents | **partial** | **partial** | **partial** |
| Commands | N/A | **partial** | **partial** |
| Rules | N/A | N/A | **partial** |
| Apps | **unsupported** (dropped) | N/A | N/A |

## 2. 逐组件分析

### 2.1 Hooks

#### 当前评级与理由

- **Codex**: partial — "Hooks require format conversion for other platforms"
- **Claude Code**: partial — "Claude hooks may require format adaptation for VS Code extension API"
- **Cursor**: partial — "Hooks require format conversion for other platforms"

#### 官方文档事实

**VS Code 目标平台**：
- VS Code 原生支持 `.github/hooks/*.json` 格式
- **同时原生读取 Claude Code 格式**：从 `.claude/settings.json` 中的 `hooks` 字段读取
- 支持 8 个生命周期事件
- 官方文档明确声明了 Claude Code 格式兼容性，并列出了已知差异（工具名称、属性大小写）

**Claude Code 源平台**：
- 非常丰富的 hooks 系统，20+ 生命周期事件（SessionStart, PreToolUse, PostToolUse, UserPromptSubmit, Stop, SubagentStart/Stop, TaskCreated/Completed, ConfigChange, CwdChanged, FileChanged, WorktreeCreate/Remove, PreCompact, PostCompact, Elicitation 等）
- 四种 hook 类型：command, http, prompt, agent
- 存储在 `.claude/settings.json` → `hooks` 字段
- VS Code **原生读取此格式**

**Codex 源平台**：
- **极其有限**：仅 5 个事件（SessionStart, PreToolUse, PostToolUse, UserPromptSubmit, Stop）
- PreToolUse/PostToolUse **仅拦截 Bash 工具**（不拦截 MCP、Write、WebSearch 等）
- 实验性功能，需要 feature flag
- 格式：`.codex/hooks.json`，JSON 结构与 Claude 类似但事件集极小

**Cursor 源平台**：
- **无 hooks 系统**。Cursor 官方文档中没有提到任何 hooks 概念。

#### 真实原因分析

| Adapter | 当前评级 | 是否准确 | 真实情况 |
|---------|---------|---------|---------|
| Claude Code → VS Code | partial | **过于保守** | VS Code 原生读取 `.claude/settings.json` 中的 hooks，格式兼容。对于 VS Code 支持的 8 个事件子集应为 full；超出部分（12+ 事件）才需考虑 partial/degraded。应区分事件覆盖率而非一刀切 partial。 |
| Codex → VS Code | partial | **基本准确** | `.codex/hooks.json` 格式与 Claude 类似但非相同，VS Code 不原生读取 Codex 格式，确实需要格式转换。但 Codex hooks 本身功能极其有限（5 事件 + 仅 Bash 拦截），转换是 straightforward 的。 |
| Cursor → VS Code | partial | **不适用** | Cursor 没有 hooks 系统。如果某个 Cursor 插件声称有 hooks，实际来源可能是误解或手动添加的文件。 |

#### 建议评级调整

- **Claude Code → VS Code**: 可升级为 `full`（对 VS Code 支持的事件子集），附注超出的事件不会被消费但不影响功能
- **Codex → VS Code**: 维持 `partial`，但注明原因是"格式转换 + 事件集有限"
- **Cursor → VS Code**: 如果没有 hooks 组件则不应出现在兼容性表中

---

### 2.2 Agents / Sub-agents

#### 当前评级与理由

- **Codex**: partial — "Agent definitions require format conversion"
- **Claude Code**: partial — "Claude markdown agents may require format conversion for other platforms"
- **Cursor**: partial — "Agent definitions require format conversion"

#### 官方文档事实

**VS Code 目标平台**：
- 支持 `.github/agents/*.agent.md` 格式
- **同时原生读取 Claude Code 格式**：从 `.claude/agents/*.md` 目录读取
- YAML frontmatter 支持字段：tools, model, handoffs, hooks
- 也支持 `AGENTS.md`

**Claude Code 源平台**：
- `.claude/agents/*.md` 文件，YAML frontmatter 非常丰富
- 支持字段：name, description, tools, disallowedTools, model, permissionMode, maxTurns, skills, mcpServers, hooks, memory, isolation, color, initialPrompt, background, effort
- VS Code **原生读取 `.claude/agents/` 目录**

**Codex 源平台**：
- `.codex/agents/*.toml` 文件（TOML 格式，完全不同于 Markdown）
- 字段：name, description, developer_instructions, nickname_candidates, model, model_reasoning_effort, sandbox_mode, mcp_servers, skills.config
- 内置 agents：default, worker, explorer

**Cursor 源平台**：
- **无独立的 custom agents 系统**
- 支持 `AGENTS.md` 在项目根目录或子目录
- Cursor rules 可以定义类似 agent 行为的规则，但没有独立的 agent 定义格式

#### 真实原因分析

| Adapter | 当前评级 | 是否准确 | 真实情况 |
|---------|---------|---------|---------|
| Claude Code → VS Code | partial | **过于保守** | VS Code 原生读取 `.claude/agents/*.md`，格式直接兼容。但 Claude Code 支持更多 frontmatter 字段（isolation, color, background 等），VS Code 可能忽略这些扩展字段。核心功能（tools, model, description）应为 full。 |
| Codex → VS Code | partial | **准确** | `.toml` → `.agent.md` 确实需要格式转换。字段映射也有差异（developer_instructions → 正文内容，sandbox_mode → 无对应，nickname_candidates → 无对应）。 |
| Cursor → VS Code | partial | **不适用** | Cursor 没有独立 agent 系统。如果存在 AGENTS.md，VS Code 可直接读取，无需转换。 |

#### 建议评级调整

- **Claude Code → VS Code**: 可升级为 `full`（VS Code 原生兼容 `.claude/agents/` 格式）
- **Codex → VS Code**: 维持 `partial`，注明".toml → .agent.md 格式转换 + 部分字段无对应"
- **Cursor → VS Code**: 如果是 AGENTS.md 应为 `full`（直接兼容）；如果无 agent 组件则不应出现

---

### 2.3 Commands

#### 当前评级与理由

- **Claude Code**: partial — "Commands may require adaptation for platform-specific execution contexts"
- **Cursor**: partial — 同上

#### 官方文档事实

**VS Code 目标平台**：
- 没有在 agent plugin 文档中发现独立的 "commands" 概念
- VS Code 有 Command Palette 和 extension commands，但这是 extension API，不是 agent plugin 概念

**Claude Code 源平台**：
- 官方文档中没有名为 "commands" 的独立插件组件
- 可能指的是 slash commands（`/commands`）或自定义命令，但这些不是通过文件系统配置的插件概念

**Cursor 源平台**：
- 官方文档中没有独立的 "commands" 插件概念

#### 真实原因分析

"Commands" 在各平台的官方文档中都**不作为独立的插件组件**存在。当前 adapter 代码中解析 commands 的逻辑可能基于早期假设或内部约定，而非官方支持的概念。

| Adapter | 当前评级 | 是否准确 | 真实情况 |
|---------|---------|---------|---------|
| Claude Code | partial | **待验证** | 需要确认 `parseCommands()` 实际解析的是什么文件。如果是 `.claude/commands/` 目录，这可能是 Claude Code 的内部功能（slash commands），在其他平台没有直接对应。 |
| Cursor | partial | **待验证** | 同上，需要确认实际解析内容。 |

#### 建议

- 需要深入调查 `parseCommands()` 的具体逻辑，确认它解析的是什么
- 如果确实是平台特有的 slash commands，`partial` 评级是合理的，但注释应更精确
- 如果是 prompt template 之类的概念，可能可以映射到 VS Code 的 `.prompt.md` 文件

---

### 2.4 Rules (.mdc → .instructions.md)

#### 当前评级与理由

- **Cursor**: partial — "Cursor .mdc rules require conversion to VS Code .instructions.md files"

#### 官方文档事实

**VS Code 目标平台**：
- `.github/instructions/*.instructions.md` 格式
- YAML frontmatter 支持 `applyTo` glob 模式
- 功能与 Cursor rules 的"Apply to Specific Files"模式对应

**Cursor 源平台**：
- `.cursor/rules/*.md` 或 `.mdc` 文件
- YAML frontmatter：`description`, `globs`, `alwaysApply`
- 四种应用模式：Always Apply, Apply Intelligently, Apply to Specific Files, Apply Manually

#### 当前转换逻辑（`convertRuleToInstruction()`）

```
Cursor .mdc 格式:                    VS Code .instructions.md:
---                                  ---
description: xxx                →    source: cursor-rule
globs: *.ts                          description: xxx
alwaysApply: true                    applyTo: always / *.ts
---                                  ---
<body content>                       <!-- Converted from Cursor .mdc -->
                                     <body content>
```

#### 真实原因分析

| 映射 | Cursor 原始值 | VS Code 转换值 | 信息损失 |
|------|-------------|---------------|---------|
| description | 保留 | 保留 | 无 |
| globs | `*.ts` | `applyTo: *.ts` | 无（语义等价） |
| alwaysApply: true | 始终应用 | `applyTo: always` | 低（VS Code 用 `**` 也可以） |
| alwaysApply: false + 无 globs | 智能应用 | 无 applyTo | **有损失**：Cursor 的"AI 决定是否应用"模式在 VS Code 中没有对应 |
| 手动应用 | 需要 @mention 引用 | 无对应 | **有损失**：VS Code 没有手动引用 instructions 的机制 |

#### 建议评级调整

- 当前 `partial` 评级**基本准确**。虽然大多数转换是无损的，但 "Apply Intelligently" 和 "Apply Manually" 两种模式在 VS Code 中没有语义等价物。
- 注释可以更精确："Most rules convert losslessly; 'Apply Intelligently' and 'Apply Manually' modes have no VS Code equivalent"

---

### 2.5 Apps (Codex App Connectors)

#### 当前评级与理由

- **Codex**: unsupported (dropped) — "App connectors are Codex-specific and not supported on other platforms"

#### 官方文档事实

**Codex App Server**：
- 这是一个完整的 JSON-RPC 2.0 协议，用于将 Codex agent 嵌入到第三方产品中
- 支持 thread/turn/item 的完整生命周期管理
- **Apps (connectors)** 是通过 `app/list`, `app/install`, `app/uninstall` API 管理的连接器
- 连接器是第三方服务集成（如 Google Drive, Slack 等），通过 MCP 协议连接
- 调用方式：`$<app-slug>` mention + `app://<id>` path

**VS Code 目标平台**：
- 没有 App Connector 的概念
- 最接近的替代是 MCP servers + VS Code extensions

#### 真实原因分析

- `unsupported` 评级**完全准确**
- Codex App Connectors 是 Codex 平台特有的基础设施概念，包括 OAuth 认证、审批流、专用 API 端点
- 这不是简单的格式转换问题，而是**平台能力差异**
- 部分 App Connector 的功能可能通过 MCP servers 实现类似效果，但不是直接映射

#### 建议

- 维持 `unsupported`
- 未来可考虑：如果某个 App Connector 本质上是 MCP server，可以提取 MCP 配置作为降级替代

---

### 2.6 Codex Rules (.rules / Starlark)

#### 官方文档事实

**Codex 源平台**：
- `.codex/rules/*.rules` 文件使用 **Starlark** 语言
- `prefix_rule(pattern, decision, justification)` 用于命令执行策略控制
- decision 可以是 allow / prompt / forbidden
- 这是**命令沙箱策略**，不是内容/上下文规则

**VS Code 目标平台**：
- `.instructions.md` 是文本内容规则
- 没有命令执行策略控制的对应概念

#### 分析

当前 Codex adapter 的 `computeCompatibility()` 中**没有处理 rules**，因为 Codex rules（Starlark 命令策略）与 VS Code instructions（文本上下文规则）是**完全不同的概念**。这是正确的省略——它们不应该被映射。

---

## 3. 核心发现总结

### 3.1 过于保守的评级（可升级）

| 组件 | Adapter | 当前 | 建议 | 原因 |
|------|---------|------|------|------|
| Hooks | Claude Code | partial | **full** | VS Code 原生读取 `.claude/settings.json` hooks 格式 |
| Agents | Claude Code | partial | **full** | VS Code 原生读取 `.claude/agents/*.md` 格式 |

### 3.2 准确的评级（维持）

| 组件 | Adapter | 评级 | 原因 |
|------|---------|------|------|
| Hooks | Codex | partial | `.codex/hooks.json` 需要格式转换 |
| Agents | Codex | partial | `.toml` → `.agent.md` 需要格式转换 + 字段差异 |
| Rules | Cursor | partial | 大部分无损转换，但 Apply Intelligently/Manually 模式无对应 |
| Apps | Codex | unsupported | 平台特有基础设施，无对应 |

### 3.3 待验证的评级

| 组件 | Adapter | 评级 | 需要验证 |
|------|---------|------|---------|
| Commands | Claude / Cursor | partial | 需确认 `parseCommands()` 解析的具体内容 |

### 3.4 不应出现的评级

| 组件 | Adapter | 问题 |
|------|---------|------|
| Hooks | Cursor | Cursor 无 hooks 系统，如果插件无 hooks 组件不应出现在兼容性表 |
| Agents | Cursor | Cursor 无独立 agent 系统，如果有 AGENTS.md 应直接兼容 |

---

## 4. 文档来源

所有分析基于以下官方文档：

| 平台 | 文档 URL | 获取状态 |
|------|---------|---------|
| VS Code | https://code.visualstudio.com/docs/copilot/customize-ai | ✅ |
| VS Code Hooks | https://code.visualstudio.com/docs/copilot/hooks | ✅ |
| VS Code Agents | https://code.visualstudio.com/docs/copilot/copilot-custom-agents | ✅ |
| VS Code Skills | https://code.visualstudio.com/docs/copilot/copilot-agent-skills | ✅ |
| VS Code Instructions | https://code.visualstudio.com/docs/copilot/copilot-customization | ✅ |
| Claude Code Hooks | https://code.claude.com/docs/en/hooks | ✅ |
| Claude Code Agents | https://code.claude.com/docs/en/sub-agents | ✅ |
| Claude Code Settings | https://code.claude.com/docs/en/settings | ✅ |
| Cursor Rules | https://cursor.com/docs/context/rules | ✅ |
| Codex Hooks | https://developers.openai.com/codex/hooks | ✅ |
| Codex Rules | https://developers.openai.com/codex/rules | ✅ |
| Codex Subagents | https://developers.openai.com/codex/subagents | ✅ |
| Codex App Server | https://developers.openai.com/codex/app-server | ✅ |

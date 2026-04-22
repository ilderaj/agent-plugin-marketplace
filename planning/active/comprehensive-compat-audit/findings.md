# Comprehensive Compatibility Audit — Findings

## 已确认历史背景

- `fix-adapter-parsing` 已记录过 Codex skills / MCP / hooks 与 Claude commands 的解析 bug，并标记为已在本地 `dev` 修复与验证。
- `compat-upgrade` 已记录过兼容性评级与部分格式转换升级，也标记为已完成。

## 本次审计聚焦

1. 当前 `dev` 分支代码是否真的包含这些修复
2. 当前 `plugins/` 生成产物是否已经与修复后的代码一致
3. Copilot 安装后显示“组件为空”究竟是生成问题、安装问题，还是宿主 UI / 平台能力问题
4. 全量 upstream plugins 在本仓库中的组件支持覆盖是否准确

## 当前源码链路审计（已确认）

- `src/adapters/codex.ts` 已支持：
	- `skills: "./skills/"` 字符串目录解析
	- `.mcp.json` 中 `mcpServers` / `servers` 双 key
	- hooks 的 object / array 双格式
- `src/adapters/claude.ts` 已支持：
	- `commands/` 下 `.md` 文件解析
	- `.mcp.json` 中 `mcpServers` / `servers` 双 key
	- hooks / agents 兼容性评级为 `full`
- `src/generator/vscode-plugin.ts` 已支持：
	- 根据组件存在情况写出官方 `plugin.json` 字段（`skills` / `agents` / `hooks` / `mcpServers`）
	- Codex YAML agents 转换成 Markdown agent 文件
	- Cursor rules 转成 `.instructions.md`
- `src/sync/pipeline.ts` + `src/sync/sync-state.ts` 已支持 toolchain fingerprint；即使上游 commit 不变，本地 adapter / generator 变化也会触发旧插件重生成。
- 因此从**实现层面**看，当前 `dev` 不是“根本没实现”，而是需要继续验证生成产物、统计脚本与宿主展示是否一致。

## 测试与已生成产物核验（已确认）

- `tests/smoke/copilot-cli.test.ts` 当前只覆盖 marketplace `add/list/browse/remove`，**不覆盖真实 `plugin install`**。这说明仓库对“可被发现”有自动化验证，但对“安装后组件是否可用”覆盖仍不够深。
- 当前仓库内已生成产物显示关键组件已实际写入：
	- `plugins/codex--build-ios-apps/plugin.json` 包含 `skills`, `agents`, `mcpServers`
	- `plugins/codex--figma/plugin.json` 包含 `skills`, `agents`, `hooks`
	- `plugins/claude--code-review/README.md` 显示 `Commands: code-review.md`
- 全量测试已通过：`218 pass / 0 fail`，其中包含 adapter、generator、sync invalidation 与 smoke。
- 结论：当前仓库状态至少证明“组件生成”不是普遍性缺失；下一步仍需核验真实安装与宿主展示。

## 真实安装抽样（已确认）

- 在隔离 `HOME` 中执行真实安装：
	- `codex--build-ios-apps` → `Installed 6 skills.`
	- `codex--figma` → `Installed 7 skills.`
	- `claude--hookify` → `Installed 1 skill.`
- 安装目录中已确认存在：
	- Codex: `skills/`, `hooks/hooks.json`, `.mcp.json`, `agents/`
	- Claude: `skills/`, `agents/`, `commands/`
- 这说明至少对有 skills 的代表性 Codex / Claude 插件，**安装与文件落地是生效的**。

## 官方宿主规范与当前实现的偏差

- GitHub Copilot CLI 官方插件规范支持的组件包括：`skills`, `agents`, `commands`, `hooks`, `mcpServers`, `lspServers`。
- 官方规范**没有** `instructions` 组件字段；因此当前 Cursor `rules -> instructions/` 转换结果即使被复制进插件目录，也不属于 Copilot CLI 的官方可加载插件组件。
- 当前生成器 `src/generator/vscode-plugin.ts` 的 `plugin.json` 只写出：`skills`, `agents`, `hooks`, `mcpServers`，**没有写 `commands`**。
- 因此当前仓库中 Claude 的 `commands/` 虽然被复制到了输出与安装目录，但从官方规范看，**并未被正式声明为插件组件**，应视为“未完整实现 / 高概率不生效”。
- 官方文档示例中的 plugin agents 文件名是 `*.agent.md`；而当前仓库生成/复制的是普通 `.md`（如 `conversation-analyzer.md`, `openai.md`）。这构成与官方规范的**格式偏差**，需视为 agents 兼容性的风险项。
- 官方规范支持 `lspServers`，但当前仓库 adapter / generator 链路没有任何 LSP 解析与生成实现。

## 当前生成产物的结构异常

- 7 个 Codex 插件顶层 `agents/` 目录同时存在新生成的 `openai.md` 与旧残留 `openai.yaml`：
	- `codex--atlassian-rovo`
	- `codex--build-ios-apps`
	- `codex--build-macos-apps`
	- `codex--build-web-apps`
	- `codex--figma`
	- `codex--notion`
	- `codex--test-android-apps`
- 根因判断：generator / pipeline 在重生成时没有先清空目标目录，历史产物被保留下来。
- 9 个 Codex 插件的 `README.md` 仍将 agent 展示成源格式 `openai.yaml`，即便输出目录里已经生成了 `openai.md`。这会误导“详情页/README”阅读者，以为 agent 仍未转换或组件未正确安装。

## 全量覆盖统计（基于当前 `plugins/` 产物）

- 总插件数：138
- Claude Code: 12
	- skills: 3
	- agents: 4
	- commands: 7
	- hooks: 0
	- MCP: 0
- Codex: 117
	- skills: 35
	- agents: 9
	- hooks: 1
	- MCP: 2
	- dropped `.app.json`: 103
- Cursor: 9
	- skills: 9
	- agents: 4
	- instructions: 2
	- hooks: 0
	- MCP: 0

## 静默冲突风险（官方 precedence 规则相关）

- 官方文档说明：skills 与 agents 发生重名时采用 first-found-wins，后加载者会被静默忽略。
- 当前生成产物存在重复 skill 名称 4 组：
	- `pr-review-canvas`（2 个 Cursor 插件）
	- `react-best-practices`（`codex--build-web-apps`, `codex--vercel`）
	- `shadcn`（`codex--build-web-apps`, `codex--vercel`）
	- `stripe-best-practices`（`codex--build-web-apps`, `codex--stripe`）
- 当前生成产物存在重复 agent ID 2 组，其中最严重的是 `openai`：
	- 9 个 Codex 插件共享 `openai` agent 名，且部分还保留 `openai.yaml` 残留
	- `code-reviewer` 同时出现在 `claude--feature-dev` 与 `claude--pr-review-toolkit`
- 这些重名冲突会导致“安装成功，但实际调用不到预期 agent/skill”这一类**静默失效**。

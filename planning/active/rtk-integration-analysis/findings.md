# RTK 接入方案分析 — Findings

## 已确认事实
- 本仓库是一个 Git-hosted marketplace，输出 `marketplace.json`、`.github/plugin/marketplace.json`、`.claude-plugin/marketplace.json`。
- 本仓库当前 upstream sync 默认只面向 Codex、Claude Code、Cursor 三个来源仓库。
- 本仓库 README 明确支持将整个仓库作为 VS Code Agent Plugins marketplace source 通过 Git URL 接入。
- `rtk` README / INSTALL 文档明确支持 `rtk init -g`（Claude Code 默认）以及 `rtk init -g --copilot`（GitHub Copilot）。
- `rtk` 并不是现成的 marketplace 仓库；目前证据只表明它是一个 CLI/tooling 仓库，包含 Claude/Copilot 集成逻辑与配置文件。
- 本仓库 `ClaudeAdapter` 仅发现带有 `.claude-plugin/plugin.json` 的目录；sync pipeline 也只会按 marker 目录把上游内容转成 `plugins/*` 后再生成 marketplace 文件。
- 本仓库 Git URL marketplace source 的发现依赖仓库根 `marketplace.json` / `.github/plugin/marketplace.json` / `.claude-plugin/marketplace.json`，不是“任意 GitHub 仓库”都可直接被当作单插件源。
- `rtk` 仓库可见的是 `.claude/`、`hooks/`、`.rtk/`、`openclaw/` 等结构；现有证据未发现 `.claude-plugin`、`.github/plugin/marketplace.json`、仓库根 `marketplace.json` 这类可被本仓库/VS Code marketplace 直接消费的标记。
- `rtk` 的 Claude / Copilot 集成本质上是“安装 RTK 二进制 + 写 hook / settings / instructions 文件”：
	- Claude 侧由 `rtk init -g` 或 `rtk init -g --auto-patch` 写入 `~/.claude` 与 `settings.json`。
	- Copilot 侧由 `rtk init --copilot` 在当前项目写入 `.github/hooks/rtk-rewrite.json` 与 `.github/copilot-instructions.md`。
- `rtk` 对 OpenClaw 的确提供独立插件目录 `openclaw/`，但这说明它是“按目标宿主各自输出安装产物”的模型，不等于已经提供了 VS Code Agent Plugin marketplace 兼容包装。

## 已落定实现策略
- 用户已选择方案 2：一次性手工接入，不建立 RTK upstream sync。
- 为了控制变更面，implementation plan 明确不新增 adapter、不扩展 `Platform` union，也不把 RTK binary 打包进插件。
- 计划采用 `plugins/claude--rtk/` 作为静态插件目录，复用现有平台前缀体系，并通过 `_meta.json` / `README.md` 记录“manual wrapper” provenance。
- 计划手工更新三份 marketplace manifest，而不是运行全量 `bun run sync`，以避免把其他 upstream 漂移带入本次变更。
- implementation plan 路径：`docs/superpowers/plans/2026-04-24-rtk-manual-integration.md`
- 仓库根 `.gitignore` 已忽略 `.worktrees/`，可以安全创建项目内 worktree。
- 当前仓库已有多个 `.worktrees/*` 先例，符合仓库现有协作方式。

## 执行约束
- companion plan 明确要求先加载 `test-driven-development`，再进入代码修改。
- completion gate 前需要加载 `verification-before-completion`。
- 需要按 tracked task 继续维护 `planning/active/rtk-integration-analysis/` 三个文件，而不是只依赖会话内上下文。

# Upstream Adapter Compatibility Upgrade — Findings

## 官方文档核心发现

### VS Code（目标平台）
- 原生读取 `.claude/settings.json` hooks 和 `.claude/agents/*.md`
- `.github/instructions/*.instructions.md` 支持 `applyTo` glob
- `.github/hooks/*.json` 支持 8 个生命周期事件
- 不读取 `.codex/` 或 `.cursor/` 目录

### Claude Code（源平台）
- hooks: 20+ 事件，四种类型（command/http/prompt/agent），存储在 `.claude/settings.json`
- agents: `.claude/agents/*.md`，YAML frontmatter 含 15+ 字段
- commands: 无独立概念，`commands/` 目录下是平台特有 shell scripts

### Codex（源平台）
- hooks: 仅 5 事件，仅 Bash 工具拦截，实验性功能
- agents: `.codex/agents/*.toml` 格式（非 Markdown）
- rules: `.codex/rules/*.rules` Starlark 语法，命令沙箱策略（非内容规则）
- apps: App Server JSON-RPC 协议，平台特有基础设施

### Cursor（源平台）
- rules: `.cursor/rules/*.mdc`，四种应用模式（Always/Intelligently/Specific/Manual）
- 无 hooks 系统
- 无独立 agent 系统（仅 AGENTS.md）

## 评级修正决策

| 组件 | Adapter | 原评级 | 新评级 | 决策依据 |
|------|---------|--------|--------|---------|
| hooks | Claude | partial | **full** | VS Code 原生读取 Claude hooks 格式 |
| agents | Claude | partial | **full** | VS Code 原生读取 `.claude/agents/` 格式 |
| hooks | Codex | partial | partial（注释改进） | 格式需要转换 + 事件集有限 |
| agents | Codex | partial | partial（注释改进） | YAML→MD 需要转换 + 部分字段无对应 |
| commands | Claude/Cursor | partial | partial（注释改进） | 平台特有 shell scripts |
| rules | Cursor | partial | partial（逻辑改进） | Apply Intelligently 模式映射改进 |
| apps | Codex | unsupported | unsupported（不变） | 平台特有基础设施 |

## 文档来源引用

- VS Code hooks: https://code.visualstudio.com/docs/copilot/hooks
- VS Code agents: https://code.visualstudio.com/docs/copilot/copilot-custom-agents
- Claude Code hooks: https://code.claude.com/docs/en/hooks
- Claude Code agents: https://code.claude.com/docs/en/sub-agents
- Codex hooks: https://developers.openai.com/codex/hooks
- Codex subagents: https://developers.openai.com/codex/subagents
- Codex app-server: https://developers.openai.com/codex/app-server
- Cursor rules: https://cursor.com/docs/context/rules

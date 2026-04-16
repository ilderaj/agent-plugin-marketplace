# Upstream Adapter 兼容性迭代计划

> 基于 [upstream-compatibility-analysis.md](upstream-compatibility-analysis.md) 的分析结论制定。
> 目标：将 partial/unsupported 组件逐步迭代到更准确的兼容性评级，或实现真正的格式转换。

## 迭代原则

1. **先修评级后改转换**：对于已经兼容但评级错误的（Claude Code hooks/agents），直接修正评级
2. **高收益优先**：Claude Code 是目前插件最多的来源之一，修正其评级影响范围最大
3. **验证驱动**：每个迭代都需要有对应的测试用例验证

---

## Phase 1: 修正 Claude Code Adapter 评级

**范围**：Claude Code adapter 的 hooks 和 agents 评级从 partial → full

**依据**：
- VS Code 原生读取 `.claude/settings.json` 中的 hooks（官方文档明确支持）
- VS Code 原生读取 `.claude/agents/*.md` 目录（官方文档明确支持）
- 不需要任何格式转换，直接兼容

**具体改动**：
1. `src/adapters/claude.ts` → `computeCompatibility()` 中：
   - hooks 级别从 `partial` 改为 `full`，notes 改为 "VS Code natively reads Claude hook format from .claude/settings.json"
   - agents 级别从 `partial` 改为 `full`，notes 改为 "VS Code natively reads .claude/agents/*.md format"
2. 更新相关测试用例

**验证**：含 hooks/agents 的 Claude Code 插件生成后 overall 应为 full（假设无 commands）

---

## Phase 2: 调查并修正 Commands 组件

**范围**：确认 `parseCommands()` 在 Claude Code adapter 和 Cursor adapter 中解析的具体内容

**步骤**：
1. 阅读 `parseCommands()` 实现，确认它解析的文件和格式
2. 对照官方文档确认这些文件的实际语义
3. 根据发现决定：
   - 如果是 Claude Code 的 slash commands（`.claude/commands/`）→ 需要确认 VS Code 是否有对应的 `.prompt.md` 文件映射
   - 如果是 Cursor 特有概念 → 确认是否有 VS Code 等价物
4. 更新评级和注释

**预期结果**：评级可能维持 partial，但注释应准确反映实际差异

---

## Phase 3: 改进 Codex Agent 格式转换

**范围**：`.codex/agents/*.toml` → `.github/agents/*.agent.md` 的格式转换

**当前状态**：标记为 partial 但可能没有实际转换逻辑

**步骤**：
1. 确认当前 generator 是否有 TOML → Markdown agent 的转换
2. 实现字段映射：
   - `name` → frontmatter `name`
   - `description` → frontmatter `description`
   - `developer_instructions` → agent markdown body
   - `model` → frontmatter `model`
   - `mcp_servers` → frontmatter `mcpServers`
3. 记录无法映射的字段：`nickname_candidates`, `sandbox_mode`, `model_reasoning_effort`
4. 转换完成后评级可升级为 `full`（无损字段）+ 注释标注有损字段

**验证**：生成的 `.agent.md` 文件应可被 VS Code 正确读取

---

## Phase 4: 改进 Codex Hooks 格式转换

**范围**：`.codex/hooks.json` → VS Code hooks 格式

**步骤**：
1. 确认 Codex hooks 的 5 个事件是否都在 VS Code 支持的 8 个事件中
2. 实现 JSON 格式映射（如有差异）
3. 处理 Codex 实验性字段

**注意事项**：Codex hooks 仅拦截 Bash 工具调用，这个限制不是格式问题而是能力问题，转换后注释应说明

---

## Phase 5: 优化 Cursor Rules 转换精度

**范围**：改进 `.mdc` → `.instructions.md` 的转换，减少信息损失

**步骤**：
1. 对于 `alwaysApply: false` + 无 `globs`（Apply Intelligently 模式）：
   - 考虑转换为 `applyTo: **` 并添加注释说明原始语义
   - 或转换为无 `applyTo`，依赖 VS Code 的默认行为
2. 对于 Apply Manually 模式：
   - 考虑映射到 VS Code 的 `.prompt.md` 文件（如果适用）
   - 或维持 partial 并在注释中说明
3. 添加 conversion fidelity 元数据到 `_meta.json`

---

## Phase 6: Codex Apps 降级策略（低优先级）

**范围**：评估是否可以从 Codex App Connectors 中提取 MCP 配置

**步骤**：
1. 分析实际的 Codex App Connector 配置
2. 如果 connector 本质是 MCP server + OAuth → 可提取 MCP 配置
3. 如果 connector 依赖 Codex 专有 API → 维持 unsupported

**预期**：大多数情况维持 unsupported，少数可降级为 MCP 配置

---

## 优先级排序

| 优先级 | Phase | 难度 | 影响面 | 依赖 |
|-------|-------|------|-------|------|
| P0 | Phase 1: Claude Code 评级修正 | 低 | 高 | 无 |
| P0 | Phase 2: Commands 调查 | 低 | 中 | 无 |
| P1 | Phase 3: Codex Agent 转换 | 中 | 中 | 无 |
| P1 | Phase 4: Codex Hooks 转换 | 中 | 低 | 无 |
| P2 | Phase 5: Cursor Rules 精度 | 中 | 中 | 无 |
| P3 | Phase 6: Codex Apps 降级 | 高 | 低 | Phase 2 |

Phase 1 和 Phase 2 可以并行执行。Phase 3-4 可以并行执行。

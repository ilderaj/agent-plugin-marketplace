# Fix Adapter Parsing — 跨平台组件丢失修复

**Goal:** 修复三个平台 adapter 中导致 plugin 组件静默丢失的解析 bug，使同步输出完整反映上游实际内容

**Companion plan:** `docs/superpowers/plans/2026-04-19-fix-adapter-parsing.md`（详细实现 checklist、代码片段、上游数据表）

---

## Current State
Status: closed
Archive Eligible: yes
Close Reason: 已合并到本地 dev，并完成 merge 后全量回归与真实安装验证
Companion sync: current

## 问题总览

6 个 bug/问题，涉及 Codex (3)、Claude (2)、测试 (1)：

| # | 严重度 | 摘要 |
|---|--------|------|
| B1 | P0 | Codex `parseSkills` — 字符串路径 vs Array.isArray |
| B2 | P0 | Codex `parseMcpServers` — `servers` vs `mcpServers` key |
| B3 | P0 | Codex `parseHooks` — hooks 是 object 不是 array |
| B4 | P0 | Claude `parseCommands` — 只匹配 .sh/.js/.ts，遗漏 .md |
| B5 | P1 | Claude `parseMcpServers` — 与 B2 同源（当前无数据命中） |
| F1 | P0 | Fixtures 不反映上游真实格式，测试通过但部署失败 |

详细根因和上游数据见 `findings.md`。

## 阶段与 Finishing Criteria

### Phase 0: 修正测试 Fixtures
修正现有 fixtures 使其反映上游真实格式，新增必要 fixtures 覆盖新场景。
**Status:** complete
**Finishing:** 所有 fixture 的格式与上游审计数据一致。

### Phase 1: Codex adapter 修复 (B1, B2, B3)
修复 `parseSkills`、`parseMcpServers`、`parseHooks` 三个方法。
**Status:** complete
**Finishing:** 修正后的 fixtures 下 parse 返回正确组件数量。

### Phase 2: Claude adapter 修复 (B4, B5)
修复 `parseCommands`、`parseMcpServers` 两个方法。
**Status:** complete
**Finishing:** .md commands 被正确解析；mcpServers key 兼容。

### Phase 3: 单元测试
更新现有测试适配新 fixtures，新增覆盖修复场景的测试用例。
**Status:** complete
**Finishing:** `bun test` 全部通过，无回归。

### Phase 4: 端到端验证
重新生成同步输出 → 文件级完整性对比 → Copilot CLI 冒烟测试 → VS Code 实际安装验证。
**Status:** complete
**Finishing:** 至少 `codex--build-ios-apps` 安装后在 Copilot 中可见 skills + MCP 组件；验证后卸载。

### Phase 5: 增量 sync 失效修复
修复 sync pipeline 仅按上游 plugin commit 决定是否重生成的问题，使本地 adapter/generator 变更也能触发旧插件输出刷新。
**Status:** complete
**Finishing:** 在上游未变化的情况下，只要本地转换工具链指纹变化，`sync` 也会重生成受影响输出并通过测试。

### Phase 6: 生成产物 provenance 清洗
修复生成 README 中泄露本机绝对 Source Path 的问题，确保提交到仓库的产物只包含逻辑/相对 source 信息。
**Status:** complete
**Finishing:** `plugins/**/README.md` 不再包含本机绝对路径；重新生成后无 `/Users/...` 泄露。

### Phase 7: 生成产物 hygiene 收口
修复文本产物在目录复制/重生成后仍残留 “new blank line at EOF” 的问题，确保 generator 输出在文本规范化后稳定通过 whitespace 检查。
**Status:** complete
**Finishing:** `git diff --check` 与 `git diff --check HEAD^ HEAD` 均无输出；merge 到本地 `dev` 后再次通过。

## 不在范围内

1. Assets 丢失（功能缺失，非 bug）
2. Codex `interface` 块映射（设计决策）
3. Source Path 展示问题（展示层）
4. Codex hooks 格式转换层（仅修复解析层，转换层另行跟踪）

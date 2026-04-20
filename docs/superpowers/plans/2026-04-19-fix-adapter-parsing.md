# Fix Adapter Parsing — Implementation Plan

> **Companion plan for:** `planning/active/fix-adapter-parsing/`
> **Task:** 修复三个平台 adapter 中导致 plugin 组件静默丢失的解析 bug

---

## 上游事实来源（经文件级审计确认）

### Codex 上游格式（基于 28 个插件全量 grep + 抽样读取 7 个 plugin.json、5 个 .mcp.json、1 个 hooks.json）

| 字段 | 实际类型 | 实际值 | 频率 |
|------|---------|--------|------|
| `skills` | **string** (目录路径) | `"./skills/"` | 27/28 |
| `mcpServers` | **string** (文件路径) | `"./.mcp.json"` | 5/28 |
| `hooks` | **string** (文件路径) | `"./hooks.json"` | 1/28 (figma) |
| `apps` | **string** (文件路径) | `"./.app.json"` | 18/28 |
| `agents` | 不在 manifest 中 | 按目录 `agents/` 约定发现 | — |

- `.mcp.json` 顶层 key: **`mcpServers`**（全部 5 个文件确认）
- `hooks.json` 的 `hooks` 字段: **object**（event name → handler array），不是 array
- 无正式 schema 文件

### Claude Code 上游格式（基于 14 个插件全量检查 + 抽样读取 6 个 plugin.json、8 个 commands 目录）

| 字段 | 实际类型 | 说明 |
|------|---------|------|
| manifest | 仅含 name/version/description/author | 不声明组件，全部按目录约定发现 |
| `commands/` | `.md` 文件 | 含 YAML frontmatter (description, allowed-tools, argument-hint) |
| `agents/` | `.md` 文件 | frontmatter: name, description, tools, model, color |
| `skills/` | `SKILL.md` | 同 Codex/Cursor 格式 |
| `hooks/` | `hooks.json` | 与 Codex 格式不同的结构 |
| `.mcp.json` | **不存在** | 14 个插件无一使用 |

### Cursor 上游格式（基于 7 个插件 + 正式 JSON Schema）

- 有正式 schema: `schemas/plugin.schema.json`
- 组件字段类型: `stringOrStringArray`（string 或 string[]）
- `mcpServers`: string, object, 或 array（schema 定义三种形式）
- Cursor adapter 已正确处理所有格式，是参考标杆

---

## Phase 0: 修正测试 Fixtures 以匹配上游真实格式

fixtures 必须反映真实上游格式，否则测试通过但部署失败。这是当前 bug 未被测试捕获的根因。

### Task 0.1: 修正 Codex fixture `codex-github`

- [ ] 将 `.codex-plugin/plugin.json` 的 `"skills": ["skills/github"]` 改为 `"skills": "./skills/"`（上游实际格式）
- [ ] 如 fixture 有 MCP，确保 `.mcp.json` 使用 `mcpServers` key

### Task 0.2: 新增 Codex fixture `codex-string-skills`

- [ ] 创建一个含多个 skills 子目录 + `.mcp.json`（使用 `mcpServers` key）的 fixture
- [ ] 用于测试字符串路径 skills 解析和 MCP key 修复

### Task 0.3: 新增 Codex fixture `codex-hooks-object`

- [ ] 创建一个 hooks.json 使用 object 格式（`{ "hooks": { "PostToolUse": [...] } }`）的 fixture
- [ ] 用于测试 hooks object 格式解析

### Task 0.4: 修正 Claude fixture `claude-code-review`

- [ ] 将 `commands/format.sh` 替换为 `commands/code-review.md`（上游实际格式）
- [ ] 添加 `.md` 格式的 YAML frontmatter（description, allowed-tools）

### Task 0.5: 新增 Claude fixture `claude-with-md-commands`

- [ ] 创建含多个 `.md` commands 的 fixture
- [ ] 用于测试 `.md` command 解析

---

## Phase 1: Codex adapter 修复

### Task 1.1: 修复 `parseSkills` — 支持字符串路径引用 (B1)

**文件:** `src/adapters/codex.ts` — `parseSkills` 方法

**当前代码:**
```typescript
if (pluginJson.skills && Array.isArray(pluginJson.skills)) {
```

**修复方案:** 当 `skills` 是字符串时，作为目录路径引用处理。扫描该目录下的子目录作为 skill 列表。参考 Cursor adapter 的 `resolveSkillPaths` 逻辑：
1. 如果字符串指向的目录本身含 `SKILL.md`，视为单个 skill
2. 否则扫描子目录，每个子目录为一个 skill

保留对数组格式的向后兼容。

- [ ] 实现字符串路径解析
- [ ] 保留数组格式支持
- [ ] 运行修正后的 fixture 测试验证

### Task 1.2: 修复 `parseMcpServers` — 支持 `mcpServers` key (B2)

**文件:** `src/adapters/codex.ts` — `parseMcpServers` 方法

**当前代码:**
```typescript
if (mcpJson.servers && typeof mcpJson.servers === 'object') {
```

**修复方案:** 优先使用 `mcpJson.mcpServers`，fallback 到 `mcpJson.servers`。

- [ ] 实现双 key 支持
- [ ] 测试验证

### Task 1.3: 修复 `parseHooks` — 支持 object 格式 hooks (B3)

**文件:** `src/adapters/codex.ts` — `parseHooks` 方法

**当前代码:**
```typescript
if (hooksJson.hooks && Array.isArray(hooksJson.hooks)) {
  for (const hook of hooksJson.hooks) {
    if (hook.events && Array.isArray(hook.events)) { ... }
  }
}
```

**上游实际格式:**
```json
{ "hooks": { "PostToolUse": [{ "matcher": "Write|Edit", "hooks": [{ "type": "command", "command": "..." }] }] } }
```

`hooks` 是 object（key 为事件名），不是 array。事件名是 key 而非嵌套的 `events` 字段。

**修复方案:** 当 `hooks` 是 object 时，遍历 entries，key 作为事件名。保留对数组格式的兼容（如果 fixture 用了）。

- [ ] 实现 object 格式解析
- [ ] 提取事件名
- [ ] 测试验证

---

## Phase 2: Claude adapter 修复

### Task 2.1: 修复 `parseCommands` — 支持 `.md` 文件 (B4)

**文件:** `src/adapters/claude.ts` — `parseCommands` 方法

**当前代码:**
```typescript
if (entry.isFile() && (entry.name.endsWith('.sh') || entry.name.endsWith('.js') || entry.name.endsWith('.ts'))) {
```

**修复方案:** 将 `.md` 加入匹配扩展名列表。

- [ ] 添加 `.md` 扩展名
- [ ] 测试验证

### Task 2.2: 修复 `parseMcpServers` — 同时支持 `mcpServers` key (B5)

**文件:** `src/adapters/claude.ts` — `parseMcpServers` 方法

**修复方案:** 与 Task 1.2 相同的修复。

- [ ] 实现双 key 支持
- [ ] 测试验证

---

## Phase 3: 单元测试

### Task 3.1: 更新 Codex adapter 测试

- [ ] 更新现有测试以适应修正后的 fixtures
- [ ] 新增测试: `parseSkills` 处理字符串路径
- [ ] 新增测试: `parseMcpServers` 处理 `mcpServers` key
- [ ] 新增测试: `parseHooks` 处理 object 格式

### Task 3.2: 更新 Claude adapter 测试

- [ ] 更新现有测试以适应修正后的 fixtures
- [ ] 新增测试: `parseCommands` 匹配 `.md` 文件
- [ ] 新增测试: `parseMcpServers` 处理 `mcpServers` key

### Task 3.3: 运行完整测试套件

- [ ] `bun test` 全部通过
- [ ] 无回归

---

## Phase 4: 端到端验证 — Copilot 实际安装测试

单元测试只验证解析逻辑，不能证明 Copilot 实际能识别和使用组件。本阶段通过真实安装验证。

### Task 4.1: 重新生成同步输出

- [ ] 运行 sync pipeline 重新生成 `plugins/` 目录
- [ ] 抽检 `codex--build-ios-apps/plugin.json`：应有 `"skills": "./skills/"` 和 `"mcpServers": "./.mcp.json"`
- [ ] 抽检 `claude--code-review/plugin.json`：应有 commands 相关字段
- [ ] 抽检 `codex--figma/plugin.json`：应有 `"hooks"` 字段

### Task 4.2: 文件级组件完整性验证

对比修复前后的输出目录，确认：

- [ ] `codex--build-ios-apps/skills/` 目录存在，包含 6 个 skill 子目录（各含 SKILL.md）
- [ ] `codex--build-ios-apps/.mcp.json` 存在，含 xcodebuildmcp 服务器定义
- [ ] `codex--figma/hooks/hooks.json` 存在
- [ ] `claude--code-review/commands/code-review.md` 存在
- [ ] `claude--hookify/commands/` 包含 4 个 `.md` 文件

### Task 4.3: Copilot CLI 安装冒烟测试

使用现有的 `tests/smoke/copilot-cli.test.ts` 模式，在隔离环境中：

- [ ] 运行已有 smoke test 确认基础 add/browse/install/remove 流程不回归
- [ ] 手动（或脚本化）安装 `codex--build-ios-apps` 到 Copilot
- [ ] 验证 Copilot 能识别 skills 列表（通过 `copilot plugin list` 或读取安装目录检查 skills/ 是否存在）
- [ ] 验证 `.mcp.json` 被正确复制到安装位置
- [ ] 卸载测试插件，确认清理干净

### Task 4.4: VS Code 实际安装验证（如可行）

- [ ] 通过 VS Code marketplace 源安装 `codex--build-ios-apps`
- [ ] 在 Copilot chat 中检查是否能看到插件的 skills 和 MCP 组件
- [ ] 确认 `_meta.json` 中的 compatibility 评级和 notes 已更新（不再全部显示 "none"）
- [ ] 截图记录验证结果
- [ ] 卸载测试插件

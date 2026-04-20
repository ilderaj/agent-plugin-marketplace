# Fix Adapter Parsing — 审计发现

## 审计方法

1. 完整阅读三个 adapter 源码：`codex.ts`, `claude.ts`, `cursor.ts`
2. 对比上游缓存（`.worktrees/mvp-sdd/.cache/sync/`）与同步输出（`plugins/`）
3. 逐一验证每种组件类型的解析路径

## 发现清单

### F1: Codex Skills 全部丢失（P0）

**根因:** `parseSkills` 方法第 131 行使用 `Array.isArray(pluginJson.skills)` 判断。Codex 标准格式是 `"skills": "./skills/"` 字符串，不是数组。条件失败，整个 skills 解析被跳过。

**影响:** 27 个 Codex 插件全部使用 `"./skills/"` 字符串格式（grep 验证，无一例外）。这些插件的全部 skills 目录及内容在同步后消失。

**对比:** Cursor adapter 的 `resolveSkillPaths` 已经正确处理了字符串路径：先尝试作为目录解析，如果目录下有 `SKILL.md` 就作为单个 skill，否则扫描子目录。

### F2: Codex MCP 全部丢失（P0）

**根因:** `parseMcpServers` 方法查找 `mcpJson.servers` key。Codex/Claude Code 生态标准 key 名是 `mcpServers`（驼峰式）。5 个有 `.mcp.json` 的 Codex 插件全部使用 `mcpServers` key。

**影响:** vercel, build-web-apps, cloudflare, build-ios-apps, hugging-face 的 MCP 配置全部丢失。

**对比:** Cursor adapter 的 `buildMcpRef` 正确使用了 `config.mcpServers` key。

### F3: Claude Commands 全部丢失（P0）

**根因:** `parseCommands` 方法只匹配 `.sh/.js/.ts` 扩展名。Claude Code 的 slash commands 使用 `.md` 格式。

**影响:** 12 个 Claude 插件中所有有 commands 的插件（至少 8 个确认有 commands 目录）的全部命令丢失。部分插件（如 `code-review`）的 `_meta.json` 仍标记为 `compatibility: "full"`，造成误导。

**受影响插件列表:**
- `claude--code-review`: 1 command (code-review.md)
- `claude--feature-dev`: 1 command (feature-dev.md)
- `claude--agent-sdk-dev`: 1 command (new-sdk-app.md)
- `claude--commit-commands`: 3 commands (commit-push-pr.md, clean_gone.md, commit.md)
- `claude--hookify`: 4 commands (help.md, list.md, configure.md, hookify.md)
- `claude--pr-review-toolkit`: 1 command (review-pr.md)
- `claude--ralph-wiggum`: 3 commands (help.md, cancel-ralph.md, ralph-loop.md)
- `claude--plugin-dev`: 1 command (create-plugin.md) — 如果此插件已同步

### F4: Codex Hooks 格式不匹配（P0 — 新发现）

**根因:** `parseHooks` 方法第 171 行使用 `Array.isArray(hooksJson.hooks)` 判断。但 Codex 实际 hooks.json 格式是：
```json
{ "hooks": { "PostToolUse": [{ "matcher": "Write|Edit", "hooks": [{ "type": "command", "command": "..." }] }] } }
```
`hooks` 是一个 **object**（key 为事件名），不是 array。`Array.isArray({})` 返回 false，hooks 被静默跳过。

**影响:** figma 插件的 hooks 丢失。虽然目前只有 1 个 Codex 插件使用 hooks，但这意味着所有使用标准 Codex hooks 格式的插件都会丢失。

### F5: Claude MCP 潜在问题（P1）

**情况:** Claude adapter 的 `parseMcpServers` 与 Codex 相同，只查找 `servers` key。当前 Claude 上游没有 `.mcp.json` 文件所以没命中。但代码逻辑一致，将来一旦有 Claude 插件使用标准 `mcpServers` key，同样会丢失。

### F6: 测试 Fixtures 不反映上游真实格式（P0 — 根因分析）

**发现:** 这是所有 bug 未被测试捕获的根本原因。

| Fixture | 字段 | fixture 值 | 上游真实值 |
|---------|------|-----------|-----------|
| `codex-github` | `skills` | `["skills/github"]` (array) | `"./skills/"` (string) |
| `claude-code-review` | `commands/` | `format.sh` (.sh 文件) | `code-review.md` (.md 文件) |
| `codex-github` | `.mcp.json` | 使用 `servers` key | 上游使用 `mcpServers` key |

测试通过是因为 fixture 恰好匹配了 adapter 的错误假设，而非真实格式。

### F7: Cursor adapter 实现最完善

Cursor adapter 是三者中代码质量最高的：
- `resolveSkillPaths` 正确处理字符串和数组格式
- `buildMcpRef` 正确使用 `mcpServers` key
- `resolveDirectoryEntries` 是通用的目录扫描工具方法
- 有独立的 `.mdc` 规则解析和转换逻辑

## 结论

Cursor adapter 可以作为修复 Codex 和 Claude adapter 的参考模型。核心问题是 Codex 和 Claude adapter 对上游格式的假设与实际不符，且所有失败都是静默的（无警告日志）。

## Session 5 补充发现：Phase 4 暴露的增量 sync 根因

### F8: 输出仍旧缺失组件并非 parser/generator 失败，而是增量 sync 未失效（P0）

**症状:** 在 worktree 中完成 adapter 修复并执行 `bun run sync` 后，`plugins/codex--build-ios-apps/plugin.json` 仍然缺少 `"skills"` / `"mcpServers"`，目录下也没有 `skills/` 与 `.mcp.json`；实际安装验证因此无法继续信任当前输出。

**已验证证据链:**

1. `VsCodePluginGenerator.buildOfficialManifest()` 明确会在 `ir.components.skills.length > 0` / `ir.components.mcpServers.length > 0` 时写出：
   - `"skills": "./skills/"`
   - `"mcpServers": "./.mcp.json"`
2. `VsCodePluginGenerator.copySkills()` / `writeMcpConfig()` 明确会落盘 `skills/` 和 `.mcp.json`
3. generator 单测已经断言这些字段和文件必须存在
4. 手动对缓存上游 `build-ios-apps` 运行当前 adapter + generator，生成结果立即包含：
   - `plugin.json.skills`
   - `plugin.json.mcpServers`
   - `skills/` 目录（6 个 skill）
   - `.mcp.json`
5. `SyncPipeline.run()` 当前只用 `stateManager.needsUpdate(platform, pluginName, pluginCommitSha)` 决定是否重生成
6. `SyncStateManager.needsUpdate()` 当前只比较 plugin 的上游 `commitSha`
7. `tests/sync/pipeline.test.ts` 还显式覆盖了“unchanged plugins are skipped”行为

**根因:** sync cache invalidation 粒度错误。它只跟踪**上游插件内容**是否变化，却不跟踪**本地转换工具链**（adapters / generator / compatibility logic）是否变化。于是这次修 parser/generator 后，所有上游 commit 未变化的插件都保留旧输出，造成 Phase 4 看起来像“修复没生效”。

**影响:** 这不是单个 `build-ios-apps` 的问题，而是所有未在本次上游更新中命中的历史生成插件都会保留旧结构与旧 compatibility 结果。

### F9: 生成 README 的 Source Path 使用了本机绝对路径（P0）

**症状:** 即便 `_meta.json._source.pluginPath` 已使用逻辑相对路径，`README.md` 的 `Source Path` 仍写入了 `ir.source.pluginPath`，在本地离线重生成后表现为 `/Users/jared/.../.cache/sync/...` 这类绝对路径。

**根因:** README 生成逻辑与 `_meta.json` 使用了不同来源字段：前者仍取绝对 `pluginPath`，后者已优先使用 `pluginRelPath`。

**影响:** 合并后的生成产物会泄露机器本地路径，且不同机器生成结果不稳定，不适合提交到共享分支。

### F10: 文本规范化只保证“至少一个换行”，未保证“恰好一个换行”（P1）

**症状:** 即便此前已经处理了 CRLF、尾随空白与可执行位，`git diff --check base..head` 仍对多个生成/复制出来的文本文件报 `new blank line at EOF`。受影响文件集中在目录递归复制出来的 `SKILL.md`、参考文档、命令文档等。

**根因:** `VsCodePluginGenerator.normalizeTextOutput()` 原逻辑是：

1. 统一换行符为 `\n`
2. 去除每行尾随空白
3. 仅在“没有结尾换行”时补一个 `\n`

这会把已有的多个结尾空行原样保留下来，因此只能满足“至少有一个结尾换行”，不能满足 “git diff --check` 所要求的“末尾不能多空一行”。

**修复:** 规范化逻辑改为在去尾随空白后，继续剥离所有结尾空行，最后统一补回一个结尾换行；同时测试夹具升级为包含多余 EOF 空行，确保目录复制路径也覆盖这个回归场景。

**结果:** worktree 与 merge 后的 `dev` 上，`git diff --check` / `git diff --check HEAD^ HEAD` 都恢复为无输出。

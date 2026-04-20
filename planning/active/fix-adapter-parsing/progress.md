# Fix Adapter Parsing — Progress

## Session 1 — 审计 + Plan

- [x] 阅读三个 adapter 完整源码 (codex.ts, claude.ts, cursor.ts)
- [x] 阅读 generator 代码 (vscode-plugin.ts, marketplace.ts)
- [x] 阅读 pipeline 代码 (pipeline.ts)
- [x] 验证上游 Codex skills 声明格式（27 个全部是字符串 `"./skills/"`）
- [x] 验证上游 Codex MCP key 名（5 个全部是 `mcpServers`）
- [x] 验证上游 Claude commands 文件格式（全部是 `.md`）
- [x] 验证 synced 输出中 Claude commands 丢失（12 个插件全部为 0）
- [x] 对比 Cursor adapter 的实现作为参考
- [x] 创建 task_plan.md, findings.md, progress.md

## Session 2 — 上游文档全量审计 + Plan 更新

- [x] 调查上游 Codex 全量 plugin.json 字段格式（28 个插件，7 个抽样读取）
- [x] 调查上游 Claude Code 全量格式（14 个插件，6 个抽样读取）
- [x] 调查上游 Cursor 格式（7 个插件 + 正式 JSON Schema）
- [x] 阅读项目文档 (README.md, docs/*.md)
- [x] 发现新 bug: Codex hooks.json 是 object 格式而非 array (B3)
- [x] 发现 fixture 不反映上游真实格式 (F6)
- [x] 检查现有测试文件和 fixtures 结构
- [x] 验证 codex-github fixture 的 skills 声明是数组格式（与上游不符）
- [x] 验证 claude-code-review fixture 的 commands 是 .sh 格式（与上游不符）
- [x] 更新 task_plan.md: 增加 Phase 0 (fixtures)、B3 (hooks)、Phase 4 (端到端验证)
- [x] 更新 findings.md: 增加 F4 (hooks)、F6 (fixtures)
- [x] 拆分 plan: 详细 checklist 移至 companion plan `docs/superpowers/plans/2026-04-19-fix-adapter-parsing.md`
- [x] task_plan.md 精简为 lifecycle + phases + finishing criteria
- [ ] 等待用户 review plan

## 待执行

等待 plan review 通过后进入实施阶段。

## Session 3 — 执行启动 / worktree 基线

- [x] 用户确认进入执行阶段，要求最终 merge 到本地 `dev`
- [x] 恢复 active task 上下文与 companion plan
- [x] 检查现有工作区状态：主工作区存在与本任务无关的未提交 planning 变更，需隔离执行
- [x] 复用 `.worktrees/` 目录，并确认已被 git ignore
- [x] 明确 worktree base：`dev @ 093d41f678e091523fcfd6f6b289f5e0196a277f`
- [x] 创建 worktree：`.worktrees/fix-adapter-parsing` → branch `feat/fix-adapter-parsing`
- [x] 在 worktree 中执行 `bun install --frozen-lockfile`
- [x] 在 worktree 中执行基线测试 `bun test`（188 pass / 0 fail）

## 当前执行位点

- 当前工作目录：`.worktrees/fix-adapter-parsing`
- 下一步：按 TDD 先补失败测试与真实 fixture，再进入 adapter 修复与回归验证

## Session 4 — Phase 0-3 实施 + 双重 review

- [x] 在 worktree 中完成 fixtures 修正与新增：
  - `codex-github` 改为真实上游 `skills: "./skills/"` 与 `mcpServers`
  - 新增 `codex-string-skills`
  - 新增 `codex-hooks-object`
  - `claude-code-review` 改为 `.md` command fixture
  - 新增 `claude-with-md-commands`
- [x] 修复 `src/adapters/codex.ts`
  - 字符串/数组 skills 兼容
  - `mcpServers` → `servers` 双 key 支持
  - hooks object / array 双格式支持
  - 缺失、非法、非目录 skill path 不再导致错误或假阳性解析
- [x] 修复 `src/adapters/claude.ts`
  - `.md` commands 支持
  - `mcpServers` → `servers` 双 key 支持
- [x] 新增/更新 adapter 与 fixture 测试，覆盖：
  - string skill paths
  - object-form hooks
  - legacy `servers` fallback
  - `mcpServers` 优先级
  - invalid skill path hardening
- [x] 实现子代理完成 Phase 0-3，提交链：
  - `4767eee9a00cfbe4e2d74d63e179ad1729597687`
  - `bcadbeb0319448e2585edb24df93507c0ce191c5`
  - `d17592b1cb48f2b5a403e16c5f9e254c53976dd0`
- [x] 规格审查通过：Phase 0-3 spec compliant
- [x] 代码质量审查完成两轮回修后通过：无 Critical / Important 剩余问题
- [x] 当前 worktree 验证结果：
  - `bun test` → 207 pass / 0 fail
  - `bun run build` → pass

## 当前执行位点

- 当前工作目录：`.worktrees/fix-adapter-parsing`
- 当前阶段：Phase 4 端到端验证
- 下一步：重新生成 `plugins/` 输出，做文件级完整性检查，再执行 Copilot 实际安装验证；完成后 merge 回本地 `dev` 并做一次完整回归验证

## Session 5 — Phase 4 调试中断 / 根因定位

- [x] 执行 `bun run sync`
- [x] 发现 `plugins/codex--build-ios-apps/plugin.json` 仍缺少 `skills` / `mcpServers`
- [x] 发现 `plugins/codex--build-ios-apps/` 目录仍无 `skills/` 与 `.mcp.json`
- [x] 系统化调试：读取 generator / pipeline / state manager / tests
- [x] 手动对缓存上游 `build-ios-apps` 运行当前 adapter + generator，证明当前代码单独生成时输出正确
- [x] 锁定根因：`SyncStateManager.needsUpdate()` 只按上游 plugin commit 判断是否需要重生成，未跟踪本地工具链变更

## 当前执行位点

- 当前工作目录：`.worktrees/fix-adapter-parsing`
- 当前阶段：Phase 5 增量 sync 失效修复（由 Phase 4 验证暴露）
- 下一步：先补失败测试覆盖“工具链变化但上游不变也必须重生成”，再修 sync invalidation；修复后重新跑 sync、Copilot 安装、merge、回归验证

## Session 6 — Final review 暴露 provenance 泄露

- [x] 完成最终 branch review
- [x] 发现 critical：离线重生成后 `plugins/**/README.md` 的 `Source Path` 使用了本机绝对路径
- [x] 验证 `_meta.json._source.upstream` 与 `data/sync-state.json.repoUrl` 已恢复为 canonical GitHub URL
- [x] 锁定根因：README 仍引用 `ir.source.pluginPath`，未复用 `pluginRelPath`

## 当前执行位点

- 当前工作目录：`.worktrees/fix-adapter-parsing`
- 当前阶段：Phase 6 生成产物 provenance 清洗
- 下一步：以测试先行修复 README 的 Source Path 字段，重新离线生成 canonical 产物，再做最终 review / merge / 回归验证

## Session 7 — EOF hygiene 收口 + feature branch 最终验证

- [x] 最终 reviewer 再次指出 `git diff --check base..head` 仍有 12 个 `new blank line at EOF`
- [x] 补回归测试：目录复制场景中的文本文件输入现在显式包含多余 EOF 空行
- [x] 修复 `VsCodePluginGenerator.normalizeTextOutput()`：从“保证至少一个结尾换行”改为“剥离所有结尾空行后补回一个换行”
- [x] 用本地 cache 再次离线 canonical 重生成受影响产物
- [x] 验证 feature worktree：
  - `git diff --check` → pass
  - `git diff --check HEAD` → pass
  - `bun test` → pass（重跑通过）
  - `bun run build` → pass
  - `bun test tests/smoke/copilot-cli.test.ts` → pass
  - 真实 `copilot plugin install/list/uninstall` → pass
- [x] 提交 feature 分支最终修复：`4c70597c73aab50f3cc59a24a0ddacbe04f96ca2`

## Session 8 — squash merge 到本地 dev

- [x] 主工作区 `dev` 预检：仅存在与本任务无关的 planning 脏改动/未跟踪文件
- [x] 执行 `git merge --squash --no-commit feat/fix-adapter-parsing`
- [x] staged merge 结果通过 whitespace 检查
- [x] 在本地 `dev` 提交 squash merge：`6d738cc`

## Session 9 — merge 后完整回归验证

- [x] 在本地 `dev` 上执行 `bun test` → pass
- [x] 在本地 `dev` 上执行 `bun run build` → pass
- [x] 在本地 `dev` 上执行 standalone smoke：
  - 首次命中 Copilot CLI `marketplace remove` 偶发态（未注册）
  - 清理 `tests/.generated/smoke` 后 fresh 重跑 → pass
- [x] 在本地 `dev` 上执行真实安装验证：
  - `copilot plugin marketplace add <repo>` → pass
  - `copilot plugin install codex--build-ios-apps@agent-plugin-marketplace` → `Installed 6 skills.`
  - `copilot plugin list` 显示插件已安装
  - 安装目录确认存在 `plugin.json`、`.mcp.json`、`skills/ios-app-intents/SKILL.md`
  - `copilot plugin uninstall ...` 后 `No plugins installed.`
- [x] 检查 provenance 泄露：
  - 无 `/Users/jared` 本机路径泄露
  - 未发现生成物层面的 `file://` upstream 泄露（`cloudflare` 文档中的 `file://` 为上游文档内容，非 provenance）

## 当前执行位点

- 当前工作目录：主工作区 `dev`
- 当前状态：任务已完成并合并到本地 `dev`
- 收尾说明：主工作区仍保留用户原有 planning 脏改动，未被本任务覆盖

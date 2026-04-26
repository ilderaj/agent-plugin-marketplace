# RTK 接入方案分析 — Task Plan

## Goal
按 `docs/superpowers/plans/2026-04-24-rtk-manual-integration.md` 执行方案 2，把 `rtk-ai/rtk` 以一次性手工维护的静态插件包方式接入本仓库，并在完成验证后合并回本地 `dev`。

## Phases
- [completed] Phase 1: 收集本仓库现有 upstream sync / marketplace / 安装机制事实
- [completed] Phase 2: 收集 `rtk` 上游仓库中 Claude / Copilot 相关集成事实
- [completed] Phase 3: 对比三种接入方案的收益、风险、长期维护与边界条件
- [completed] Phase 4: 输出推荐结论与建议的后续执行路径
- [completed] Phase 5: 基于方案 2 产出 companion implementation plan（仅计划，不执行）
- [in_progress] Phase 6: 建立隔离 worktree，按 companion plan 执行 Task 1（先 red，再 green）
- [pending] Phase 7: 执行 companion plan Task 2 与 Task 3，并完成自动化验证
- [pending] Phase 8: 执行 companion plan Task 4、收尾 review、merge 回本地 `dev`

## Current State
Status: active
Archive Eligible: no
Close Reason:

## Decisions
- 仅做分析，不直接改动仓库代码或配置
- 优先基于仓库现有的 sync / marketplace 模式进行评估
- 评估标准以“与本仓库现有架构的贴合度、后续维护成本、用户安装体验、升级路径清晰度”为主
- 推荐路径为方案 2：将 RTK 作为一次性、手工维护的静态插件包接入本仓库
- implementation plan 已写入 `docs/superpowers/plans/2026-04-24-rtk-manual-integration.md`
- 执行阶段采用 `.worktrees/` 下隔离工作区，完成后再把变更 merge 回本地 `dev`
- 执行顺序遵循 companion plan 的 Task 1 → Task 4，并用 SQL todos 跟踪状态

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `rtk-ai.app` 支持页面直链返回 404 | 1 | 改抓 README / INSTALL.md 与其他 guide 入口页交叉验证 |

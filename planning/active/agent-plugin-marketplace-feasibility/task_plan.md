# ASC upstream integration task plan

## 目标
将 `rorkai/app-store-connect-cli-skills` 作为常驻 upstream 接入 sync pipeline，生成可发布的 `community--asc-cli-skills` 插件与 marketplace 条目。

## Companion Plan
- Path: `docs/superpowers/plans/2026-04-27-asc-upstream-integration.md`
- Summary: 通过新增 `AscSkillsAdapter` 将 repo-root skill pack 合成为单个 `community` 来源插件，并打通默认配置、生成器、sync pipeline、产物生成与文档。
- Sync-back status: implementation merged into dev and pushed to origin/dev

## Current State
Status: closed
Archive Eligible: yes
Close Reason: Merged into local dev and pushed to origin/dev.

## 阶段
1. `complete` 扩展平台类型与默认配置，补 `tests/index.test.ts`
2. `complete` 新增 asc adapter 与 fixture、adapter 测试
3. `complete` 调整生成器与对应测试
4. `complete` 打通 sync pipeline 与 smoke 测试
5. `complete` 更新 README、生成受管产物并完成全量验证

## 关键决策
- 保持单一 `community` upstream，不提前泛化为多社区源架构。
- 以 repo root `skills/` 合成为单个插件，而不是把每个 skill 当成独立插件。
- 明确 `asc` CLI 是外部运行时依赖，不打包进插件。

## 风险与注意
- 当前工作区真实基线在 `dev`，因此已切到独立 worktree `.worktrees/asc-upstream-integration/` 执行。
- 本机 `bun` 不在 PATH，需要显式使用 `~/.bun/bin/bun`。
- companion plan 把 adapter 注册示意放在 Task 1，但实际实现要等 `src/adapters/asc-skills.ts` 在 Task 2 创建后再接入 `createPipeline()`，否则无法保持 TDD 的最小绿灯路径。

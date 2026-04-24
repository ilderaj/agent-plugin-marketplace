# RTK 接入方案分析 — Task Plan

## Goal
先评估将 `rtk-ai/rtk` 纳入本仓库生态的三种方案，给出推荐结论；在用户选择方案 2 后，再产出一份仅针对“一次性手工接入”的 implementation plan。当前仍不直接执行代码改动。

## Phases
- [completed] Phase 1: 收集本仓库现有 upstream sync / marketplace / 安装机制事实
- [completed] Phase 2: 收集 `rtk` 上游仓库中 Claude / Copilot 相关集成事实
- [completed] Phase 3: 对比三种接入方案的收益、风险、长期维护与边界条件
- [completed] Phase 4: 输出推荐结论与建议的后续执行路径
- [completed] Phase 5: 基于方案 2 产出 companion implementation plan（仅计划，不执行）

## Current State
Status: waiting_execution
Archive Eligible: no
Close Reason: 已完成方案分析与 implementation plan 输出，等待用户确认是否进入执行阶段

## Decisions
- 仅做分析，不直接改动仓库代码或配置
- 优先基于仓库现有的 sync / marketplace 模式进行评估
- 评估标准以“与本仓库现有架构的贴合度、后续维护成本、用户安装体验、升级路径清晰度”为主
- 推荐路径为方案 2：将 RTK 作为一次性、手工维护的静态插件包接入本仓库
- implementation plan 已写入 `docs/superpowers/plans/2026-04-24-rtk-manual-integration.md`

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `rtk-ai.app` 支持页面直链返回 404 | 1 | 改抓 README / INSTALL.md 与其他 guide 入口页交叉验证 |

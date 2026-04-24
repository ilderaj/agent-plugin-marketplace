# RTK 接入方案分析 — Progress

## 2026-04-24
- 创建任务目录：`planning/active/rtk-integration-analysis/`
- 读取流程技能：`using-superpowers`、`brainstorming`、`planning-with-files`
- 发现仓库已有 upstream sync / compatibility 相关计划文档
- 读取 `README.md`、`marketplace.json`、部分 `docs/plans/*` 文档
- 抓取 `rtk` GitHub README 与 `INSTALL.md` 的关键信息
- 初步结论：本仓库的 Git URL 安装能力针对 marketplace 仓库，不等价于“任意 GitHub repo 都可直接作为单插件来源”
- 恢复中断上下文，读取 `planning/active/rtk-integration-analysis/` 三个规划文件
- 核对本仓库源码：`src/adapters/claude.ts`、`src/sync/pipeline.ts`、`src/generator/marketplace.ts`、`src/index.ts`
- 确认本仓库 discovery 依赖 marker 目录（Claude 为 `.claude-plugin/plugin.json`），marketplace 输出依赖仓库根与标准发现路径中的 `marketplace.json`
- 通过 GitHub 仓库检索与页面抓取确认：`rtk` 当前暴露的是 `.claude/`、`hooks/`、`.rtk/`、`openclaw/` 等结构，Claude/Copilot 安装通过 `rtk init` 写 hook / instructions，不是标准 marketplace plugin 包
- 形成结论：
	- 若要纳入 upstream sync，不是“加一个 upstream URL”这么简单，而是要新增 RTK 特化适配层或包装流程
	- 一次性手工接入可行，复杂度和维护面明显更低
	- 直接用 `https://github.com/rtk-ai/rtk` 作为 VS Code marketplace source 不满足当前本仓库/VS Code 的 marketplace 发现协议
- 用户确认按方案 2 落地，但先要 implementation plan，不直接执行
- 读取 `writing-plans` skill，并补充核对：`package.json`、示例插件目录、smoke tests、artifact audit、`src/adapters/types.ts`、`src/generator/vscode-plugin.ts`
- 继续抓取 RTK upstream 细节，确认 Copilot hook JSON 为 `rtk hook copilot`，并确认 VS Code Chat 与 Copilot CLI 的不同行为语义
- 解析 RTK `v0.37.2` 对应 commit：`80a6fe606f73b19e52b0b330d242e62a6c07be42`
- 产出 companion implementation plan：`docs/superpowers/plans/2026-04-24-rtk-manual-integration.md`

## Next
- 等待用户确认是否进入 execution 阶段。
- 若进入执行，按 `docs/superpowers/plans/2026-04-24-rtk-manual-integration.md` 的 Task 1 → Task 4 顺序推进。

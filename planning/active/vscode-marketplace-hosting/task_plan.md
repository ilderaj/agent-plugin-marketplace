# VS Code Marketplace Hosting 修复计划

## Current State
Status: closed
Archive Eligible: no
Close Reason: Implemented triple-write marketplace output, standardized relative plugin sources, and verified marketplace consumption with tests.

**Goal:** 让仓库作为 VS Code Agent Plugins marketplace source 时能稳定发现并展示插件。

**Root hypothesis:** 当前仓库只生成 `marketplace.json` 和 `.github/plugin/marketplace.json`，但官方/兼容加载路径还需要 `.claude-plugin/marketplace.json`，并且 marketplace entry 的相对 `source` 需要更符合标准约定。

**Phases:**
1. 修正 marketplace 生成位置与相对路径约定 — complete
2. 补齐测试与工作流检测路径 — complete
3. 运行验证并根据结果微调文档/设置 — complete

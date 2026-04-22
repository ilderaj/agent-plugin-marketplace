# Comprehensive Compatibility Audit — 全面兼容性与安装生效审计

**Goal:** 全面审计当前 `dev` 分支中插件同步、安装、组件解析与兼容性标注是否真实可靠，确认为何用户在 Copilot 中看到安装成功但组件为空，并输出全量 upstream 插件支持情况与缺口。

## Current State
Status: active
Archive Eligible: no
Close Reason:
Companion sync: n/a

## Phases

### Phase 1: 恢复背景与明确审计范围
**Status:** complete
**Finishing:** 读取现有相关 planning 文件，确认本次为新的独立审计任务。

### Phase 2: 审计当前代码链路
**Status:** complete
**Finishing:** 读完 adapter / generator / sync pipeline / CLI 冒烟相关实现，确认当前 `dev` 理论行为。

### Phase 3: 真实数据与安装行为核验
**Status:** complete
**Finishing:** 基于仓库内脚本、测试或实际生成产物验证组件是否被正确生成并能被安装识别。

### Phase 4: 全量 upstream 兼容性盘点
**Status:** complete
**Finishing:** 输出各平台插件对 skills / agents / hooks / commands / MCP / rules / instructions 等组件的支持矩阵和异常点。

### Phase 5: 结论与建议
**Status:** in_progress
**Finishing:** 明确回答“是没实现、实现有缺口、还是产物/宿主限制”，并给出后续建议。

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|

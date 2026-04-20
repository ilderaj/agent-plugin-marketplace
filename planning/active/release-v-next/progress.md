# 进度日志

## 2026-04-19
- 初始化发布任务规划文件。
- 已检查 `package.json` 与 `marketplace.json`，发现仓库级版本尚未显式声明。
- 已确认当前最高 tag 为 `1.0.2`，工作区干净，当前分支为 `dev`。
- 尝试读取 GitHub release 列表时遇到 `EOF`，改为基于本地 Git 标签与提交历史整理发布信息。
- 已提取 `1.0.2` 之后的提交范围，并生成 `release-notes-1.0.3.md` 作为发布说明源文件。
- 已创建 GitHub Release `1.0.3`，目标提交为 `093d41f678e091523fcfd6f6b289f5e0196a277f`。
- 已通过 `gh release view 1.0.3 --json tagName,name,url,targetCommitish,isDraft,isPrerelease` 验证：tag、标题、URL 与目标提交均正确，且不是 draft / prerelease。

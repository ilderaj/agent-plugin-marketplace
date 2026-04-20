# 发现记录

- `package.json` 当前没有 `version` 字段。
- `marketplace.json` 中包含插件级别的版本信息，但不是仓库总版本。
- 需要通过 Git tag / GitHub release 历史来确定本次发布应从哪个版本递增。
- 当前本地最高 Git tag 为 `1.0.2`，按用户要求的 `+0.0.1` 递增后，下一个版本应为 `1.0.3`。
- 当前分支为 `dev`，工作区干净，没有未提交改动。
- `gh release list` 调用 GitHub GraphQL API 时返回 `EOF`，说明远端 release 查询暂时不可作为唯一依据，需结合本地 Git 历史继续推进。
- `1.0.2..HEAD` 范围内包含两条发布相关提交：
	- `213e98c` — add VS Code marketplace source configuration and update settings
	- `093d41f` — add release planning documents and versioning notes
- 本仓库的“版本号”在发布实践上由 Git tag / GitHub Release 表达，而不是 `package.json` 顶层字段。
- `gh release create 1.0.3 --target 093d41f...` 执行成功，随后 `gh release view 1.0.3 --json ...` 验证通过。

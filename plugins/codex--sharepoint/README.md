# Sharepoint (from Codex)

## Source
- Platform: codex
- Plugin ID: codex--sharepoint
- Upstream: https://github.com/openai/plugins.git
- Source Path: plugins/sharepoint
- Version: 0.1.0

## Compatibility Summary
- Overall: partial
- Skill: full — Skills are cross-platform compatible
- .app.json: unsupported — App connectors are Codex-specific and not supported on other platforms
- Warning: App connector will be dropped when converting to other platforms

## Components
- Skills: sharepoint-spreadsheets, sharepoint-word-docs, sharepoint-site-discovery, sharepoint-spreadsheet-formula-builder, sharepoint-shared-doc-maintenance, sharepoint-powerpoint, sharepoint
- Agents: none
- Hooks: none
- MCP: none
- Commands: none
- Instructions: none

## Dropped Components
- .app.json: App connectors are Codex-specific and not supported on other platforms

## Notes
- No additional conversion notes.
- No command files required manual verification.
- Codex `.app.json` support is not available in VS Code and was omitted from the generated plugin.

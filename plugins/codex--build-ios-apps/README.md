# Build Ios Apps (from Codex)

## Source
- Platform: codex
- Plugin ID: codex--build-ios-apps
- Upstream: https://github.com/openai/plugins.git
- Source Path: plugins/build-ios-apps
- Version: 0.1.0

## Compatibility Summary
- Overall: partial
- Skill: full — Skills are cross-platform compatible
- Agent: partial — Codex YAML agents are converted to markdown with frontmatter (name, description) and body (developer_instructions). Fields sandbox_mode and nickname_candidates have no VS Code equivalent and are omitted.
- MCP: full — MCP servers are cross-platform compatible

## Components
- Skills: ios-app-intents, swiftui-liquid-glass, swiftui-performance-audit, swiftui-ui-patterns, ios-debugger-agent, swiftui-view-refactor
- Agents: openai.md
- Hooks: none
- MCP: xcodebuildmcp
- Commands: none
- Instructions: none

## Dropped Components
- None

## Notes
- No additional conversion notes.
- No command files required manual verification.
- No platform-specific app connectors were dropped.

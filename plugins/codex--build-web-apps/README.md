# Build Web Apps (from Codex)

## Source
- Platform: codex
- Plugin ID: codex--build-web-apps
- Upstream: https://github.com/openai/plugins.git
- Source Path: /home/runner/work/agent-plugin-marketplace/agent-plugin-marketplace/.cache/sync/codex/plugins/build-web-apps
- Version: 0.1.0

## Compatibility Summary
- Overall: partial
- Agent: partial — Agent definitions require format conversion
- .app.json: unsupported — App connectors are Codex-specific and not supported on other platforms
- Warning: App connector will be dropped when converting to other platforms

## Components
- Skills: none
- Agents: openai.yaml
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

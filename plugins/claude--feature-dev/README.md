# Feature Dev (from Claude Code)

## Source
- Platform: claude-code
- Plugin ID: claude-code--feature-dev
- Upstream: https://github.com/anthropics/claude-code.git
- Source Path: plugins/feature-dev
- Version: 1.0.0

## Compatibility Summary
- Overall: partial
- Agent: full — VS Code natively reads .claude/agents/*.md
- Commands: partial — copied to output and require manual verification in VS Code
- Warning: Command files were copied to the output plugin and require manual verification in VS Code.

## Components
- Skills: none
- Agents: code-reviewer.md, code-explorer.md, code-architect.md
- Hooks: none
- MCP: none
- Commands: feature-dev.md
- Instructions: none

## Dropped Components
- None

## Notes
- No additional conversion notes.
- Command files were copied to the generated plugin, but they require manual verification in VS Code.
- No platform-specific app connectors were dropped.

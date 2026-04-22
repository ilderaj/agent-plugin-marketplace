# Agent Sdk Dev (from Claude Code)

## Source
- Platform: claude-code
- Plugin ID: claude-code--agent-sdk-dev
- Upstream: https://github.com/anthropics/claude-code.git
- Source Path: plugins/agent-sdk-dev
- Version: 1.0.0

## Compatibility Summary
- Overall: partial
- Agent: full — VS Code natively reads .claude/agents/*.md
- Commands: partial — copied to output and require manual verification in VS Code
- Warning: Command files were copied to the output plugin and require manual verification in VS Code.

## Components
- Skills: none
- Agents: agent-sdk-verifier-py.md, agent-sdk-verifier-ts.md
- Hooks: none
- MCP: none
- Commands: new-sdk-app.md
- Instructions: none

## Dropped Components
- None

## Notes
- No additional conversion notes.
- Command files were copied to the generated plugin, but they require manual verification in VS Code.
- No platform-specific app connectors were dropped.

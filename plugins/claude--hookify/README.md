# Hookify (from Claude Code)

## Source
- Platform: claude-code
- Plugin ID: claude-code--hookify
- Upstream: https://github.com/anthropics/claude-code.git
- Source Path: plugins/hookify
- Version: 0.1.0

## Compatibility Summary
- Overall: partial
- Skill: full — Skills are cross-platform compatible
- Agent: full — VS Code natively reads .claude/agents/*.md
- Commands: partial — copied to output and require manual verification in VS Code
- Warning: Command files were copied to the output plugin and require manual verification in VS Code.

## Components
- Skills: writing-rules
- Agents: conversation-analyzer.md
- Hooks: none
- MCP: none
- Commands: help.md, list.md, configure.md, hookify.md
- Instructions: none

## Dropped Components
- None

## Notes
- No additional conversion notes.
- Command files were copied to the generated plugin, but they require manual verification in VS Code.
- No platform-specific app connectors were dropped.

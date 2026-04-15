# Create Plugin (from Cursor)

## Source
- Platform: cursor
- Plugin ID: cursor--create-plugin
- Upstream: https://github.com/cursor/plugins.git
- Source Path: /Users/jared/AgentPlugins/agent-plugin-marketplace/.worktrees/copilot-compat/.cache/sync/cursor/create-plugin
- Version: 1.0.0

## Compatibility Summary
- Overall: partial
- Skill: full — Skills are cross-platform compatible
- Agent: partial — Agent definitions require format conversion
- Rules: partial — converted to VS Code `.instructions.md` files
- Warning: Cursor .mdc rules require conversion to VS Code .instructions.md files

## Components
- Skills: review-plugin-submission, create-plugin-scaffold
- Agents: plugin-architect.md
- Hooks: none
- MCP: none
- Commands: none
- Instructions: plugin-quality-gates.instructions.md

## Dropped Components
- None

## Notes
- Cursor rules were converted to VS Code `.instructions.md` files instead of being copied verbatim.
- No command files required manual verification.
- No platform-specific app connectors were dropped.

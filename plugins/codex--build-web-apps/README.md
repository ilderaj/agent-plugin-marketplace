# Build Web Apps (from Codex)

## Source
- Platform: codex
- Plugin ID: codex--build-web-apps
- Upstream: https://github.com/openai/plugins.git
- Source Path: plugins/build-web-apps
- Version: 0.1.0

## Compatibility Summary
- Overall: partial
- Skill: full — Skills are cross-platform compatible
- Agent: partial — Codex YAML agents are converted to markdown with frontmatter (name, description) and body (developer_instructions). Fields sandbox_mode and nickname_candidates have no VS Code equivalent and are omitted.

## Components
- Skills: react-best-practices, supabase-best-practices, stripe-best-practices, shadcn-best-practices, frontend-app-builder
- Agents: openai.md
- Hooks: none
- MCP: none
- Commands: none
- Instructions: none

## Dropped Components
- None

## Notes
- No additional conversion notes.
- No command files required manual verification.
- No platform-specific app connectors were dropped.

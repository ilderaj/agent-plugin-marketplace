# Figma (from Codex)

## Source
- Platform: codex
- Plugin ID: codex--figma
- Upstream: https://github.com/openai/plugins.git
- Source Path: plugins/figma
- Version: 2.0.7

## Compatibility Summary
- Overall: partial
- Skill: full — Skills are cross-platform compatible
- Agent: partial — Codex YAML agents are converted to markdown with frontmatter (name, description) and body (developer_instructions). Fields sandbox_mode and nickname_candidates have no VS Code equivalent and are omitted.
- .app.json: unsupported — App connectors are Codex-specific and not supported on other platforms
- Warning: App connector will be dropped when converting to other platforms

## Components
- Skills: figma-implement-design, figma-use, figma-generate-design, figma-generate-library, figma-create-new-file, figma-create-design-system-rules, figma-code-connect-components
- Agents: openai.md
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

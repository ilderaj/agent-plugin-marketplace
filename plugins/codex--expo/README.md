# Expo (from Codex)

## Source
- Platform: codex
- Plugin ID: codex--expo
- Upstream: https://github.com/openai/plugins.git
- Source Path: plugins/expo
- Version: 1.0.0

## Compatibility Summary
- Overall: partial
- Skill: full — Skills are cross-platform compatible
- Agent: partial — Codex YAML agents are converted to markdown with frontmatter (name, description) and body (developer_instructions). Fields sandbox_mode and nickname_candidates have no VS Code equivalent and are omitted.

## Components
- Skills: expo-dev-client, native-data-fetching, expo-api-routes, expo-deployment, expo-ui-jetpack-compose, expo-ui-swift-ui, use-dom, expo-module, building-native-ui, codex-expo-run-actions, upgrading-expo, expo-cicd-workflows, expo-tailwind-setup
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

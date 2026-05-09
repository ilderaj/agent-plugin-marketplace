# Cursor Team Kit (from Cursor)

## Source
- Platform: cursor
- Plugin ID: cursor--cursor-team-kit
- Upstream: https://github.com/cursor/plugins.git
- Source Path: cursor-team-kit
- Version: 1.1.0

## Compatibility Summary
- Overall: partial
- Skill: full — Skills are cross-platform compatible
- Agent: partial — Agent definitions require format conversion
- Rules: partial — converted to VS Code `.instructions.md` files
- Warning: Cursor .mdc rules were converted to VS Code .instructions.md files.

## Components
- Skills: deslop, make-pr-easy-to-review, weekly-review, control-ui, review-and-ship, new-branch-and-pr, what-did-i-get-done, fix-ci, loop-on-ci, verify-this, workflow-from-chats, get-pr-comments, run-smoke-tests, fix-merge-conflicts, check-compiler-errors, control-cli, pr-review-canvas
- Agents: ci-watcher.md
- Hooks: none
- MCP: none
- Commands: none
- Instructions: no-inline-imports.instructions.md, typescript-exhaustive-switch.instructions.md

## Dropped Components
- None

## Notes
- Cursor rules were converted to VS Code `.instructions.md` files instead of being copied verbatim.
- No command files required manual verification.
- No platform-specific app connectors were dropped.

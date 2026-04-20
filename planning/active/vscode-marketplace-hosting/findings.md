# Findings

- Claude marketplace docs require `.claude-plugin/marketplace.json` at the marketplace root.
- Relative plugin sources resolve against the marketplace root, not the nested manifest directory.
- The current repo already emits `marketplace.json` and `.github/plugin/marketplace.json`, but not `.claude-plugin/marketplace.json`.
- The marketplace generator currently writes plugin sources as `plugins/<name>`.
- A third generated copy should remove the need for a manual large-file duplication.
- Verified the fix by adding `.claude-plugin/marketplace.json` generation and switching generated plugin sources to `./plugins/<name>`.
- The Copilot CLI smoke test passed after the change, confirming the generated marketplace can be added and browsed successfully.

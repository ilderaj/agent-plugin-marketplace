# Progress

- 2026-04-20: Started investigation into why the hosted marketplace source shows up but no plugins are discoverable.
- 2026-04-20: Confirmed the repo has no `.claude-plugin/` directory yet.
- 2026-04-20: Confirmed the sync pipeline currently writes only `marketplace.json` and `.github/plugin/marketplace.json`.
- 2026-04-20: Working hypothesis updated to generate `.claude-plugin/marketplace.json` as part of sync output.
- 2026-04-20: Implemented triple-write output (`marketplace.json`, `.github/plugin/marketplace.json`, `.claude-plugin/marketplace.json`).
- 2026-04-20: Updated marketplace entry sources to use `./plugins/<name>` relative paths.
- 2026-04-20: Verified with `bun test tests/generator/marketplace.test.ts tests/sync/pipeline.test.ts` and `bun test tests/smoke/copilot-cli.test.ts`.

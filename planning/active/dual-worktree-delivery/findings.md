# Findings & Decisions
<!-- 
  WHAT: Your knowledge base for the task. Stores everything you discover and decide.
  WHY: Context windows are limited. This file is your "external memory" - persistent and unlimited.
  WHEN: Update after ANY discovery, especially after 2 view/browser/search operations (2-Action Rule).
-->

## Requirements
- Determine whether the two attached implementation plans conflict at the file / behavior level.
- Decide whether they should run sequentially or in parallel, and whether multiple worktrees are required.
- If conflicts are manageable, complete the work in isolated worktrees as needed.
- Integrate everything back into local `dev` and push to `origin/dev`.

## Research Findings
- The repository already has a project-local `.worktrees/` directory, and `.gitignore` ignores `.worktrees/`, so it is safe to create new worktrees there.
- Current branch is `dev`, tracking `origin/dev`.
- Existing extra worktree: `.worktrees/mvp-sdd` on branch `feat/mvp-sdd`.
- The compatibility plan touches `src/generator/marketplace.ts`, `src/generator/vscode-plugin.ts`, `src/sync/pipeline.ts`, `tests/generator/*`, `tests/sync/pipeline.test.ts`, `tests/smoke/copilot-cli.test.ts`, `.github/workflows/sync.yml`, and README-related docs.
- The automated upstream sync CI plan touches `src/sync/pipeline.ts`, `src/sync/report-formatter.ts`, `src/index.ts`, `tests/sync/pipeline.test.ts`, `.github/workflows/sync.yml`, and `.github/workflows/ci.yml`.
- Immediate overlap between plans exists in `src/sync/pipeline.ts`, `tests/sync/pipeline.test.ts`, and `.github/workflows/sync.yml`.
- Local `dev` HEAD message is `feat(ci): implement automated upstream sync CI with enriched SyncReport and webhook notifications`, which strongly suggests the CI plan may already be implemented on `dev`.
- Follow-up inspection disproved the commit-subject hint: `HEAD` only added the CI plan markdown file, and the codebase still lacks the actual CI-plan implementation.
- Current code still has the old shapes:
  - `SyncReport` only has `updated` / `total`
  - `MarketplacePluginEntry` only has `name` / `source` / `description`
  - `plugin.json` still mixes official fields with `_source`, `_compatibility`, and `displayName`
  - `src/index.ts` does not write `SYNC_REPORT_PATH`
  - `.github/workflows/ci.yml` does not exist
- A read-only audit concluded the two top-level plans should not be executed in parallel because they both modify pipeline core logic and the sync workflow.
- Recommended order is: compatibility plan first, then CI workflow plan. The second worktree should be created from the updated `dev` after the compatibility work is merged.
- `package.json` shows the repo uses Bun (`bun test`, `bun run sync`, `bun run build`), so new worktrees should use `bun install` for setup.
- The compatibility plan's later acceptance criteria include:
  - pipeline reads both `plugin.json` and `_meta.json`
  - `marketplace.json` is written to both the repo root and `.github/plugin/`
  - add a conditional Copilot CLI smoke test under `tests/smoke/copilot-cli.test.ts`
  - regenerate all plugin outputs via `bun run sync`
  - update README Option A and the v0.3 roadmap bullets to describe standard Copilot CLI marketplace usage
- The current README still contains the old vague Git-marketplace instructions and outdated roadmap bullets, so the documentation part of the compatibility plan is still outstanding.
- The first implementation pass in `feat/copilot-compat` landed as two commits:
  - `ffcac8c` — compatibility plan implementation
  - `c852b2b` — `tags` end-to-end fix after spec review
- A follow-up quality pass landed as commit `7d13c78`, addressing three meaningful issues:
  - missing-version plugins now receive fallback version `0.0.0`
  - `_meta.json` now writes portable relative `pluginPath` values instead of absolute local filesystem paths
  - README now correctly says `_compatibility` lives in `_meta.json`
- The second spec review was partially unsound: it incorrectly treated optional metadata (`tags`, `category`, `repository`, `keywords`) as mandatory for every real plugin. Independent verification showed the actual requirement is end-to-end propagation when upstream data exists, which is now covered by tests.
- An offline verification path works reliably for regeneration:
  - create bare mirrors from `.cache/sync/{platform}`
  - override `CODEX_REPO_URL`, `CLAUDE_CODE_REPO_URL`, `CURSOR_REPO_URL` to local `file://...` mirrors
  - delete `data/sync-state.json` before rerun to force full regeneration
- Offline forced regeneration on the compatibility worktree produced the expected results:
  - `plugins/codex--box/plugin.json` now contains `"version": "0.0.0"`
  - `plugins/*/_meta.json` no longer contain absolute `pluginPath` values
  - README compatibility line now references `_meta.json`
- Post-fix verification results on the compatibility worktree:
  - `bun test` passed: 160 tests
  - `bun run build` passed
  - offline `bun run sync` succeeded with `Synced 47/47 plugins`
- The sync-CI worktree was created from merged `dev @ 63cda9c2d970f07fe9ed5a0d69d11745f4d27c17`, so it inherited the compatibility changes and avoided rebasing across overlapping pipeline/workflow edits.
- The sync-CI plan landed in two commits:
  - `0e28788` — initial CI/report/workflow implementation
  - `0dc4a2c` — fix repeated removed-plugin reporting by deleting removed plugins from persisted sync state
- The sync-CI branch passed both spec review and code quality review after the state-cleanup fix.
- Final merged `dev` contains both plan outcomes and was pushed successfully:
  - `HEAD` and `origin/dev` both resolve to `1a1160ebc863490858af141def54fff4bd4534fe`
  - repository verification on merged `dev` passed with 172 tests and a clean build
- Remaining active worktrees after completion: only the unrelated pre-existing `.worktrees/mvp-sdd`; both task-specific worktrees were removed.

| Decision | Rationale |
|----------|-----------|
| Compare plan file structure first, then inspect current implementation state | File overlap alone is not enough; one plan may already be present on `dev` |
| Reuse `.worktrees/` instead of inventing a new location | It already exists and passes ignore verification |
| Do not parallelize the two top-level plans | Both plans directly modify `src/sync/pipeline.ts` and `.github/workflows/sync.yml` |
| Execute compatibility before CI enhancements | The compatibility work changes generated artifact format and marketplace output paths; CI enhancements should build on that stabilized baseline |
| Treat the compatibility task as spec-complete once optional metadata is proven to propagate when present | The plan does not require every upstream plugin to have non-empty `tags/category/repository/keywords` |
| Use offline mirror-based sync for forced regeneration when GitHub access is unreliable | This preserves deterministic outputs and avoids blocking on network reachability |

## Issues Encountered
<!-- 
  WHAT: Problems you ran into and how you solved them.
  WHY: Similar to errors in task_plan.md, but focused on broader issues (not just code errors).
  WHEN: Document when you encounter blockers or unexpected challenges.
  EXAMPLE:
    | Empty file causes JSONDecodeError | Added explicit empty file check before json.load() |
-->
<!-- Errors and how they were resolved -->
| Issue | Resolution |
|-------|------------|
| `HEAD` commit subject looked like finished CI work but only added the plan doc | Verified actual source files before deciding execution order |
| External spec feedback overreached by requiring optional metadata on every generated plugin | Independently verified the plan wording, code paths, and tests; treated the feedback as non-blocking |
| `bun run sync` can no-op after generator changes because `data/sync-state.json` suppresses unchanged upstream plugins | Remove `data/sync-state.json` before rerun when forced regeneration is required |

## Resources
- `docs/plans/2026-04-15-copilot-cli-marketplace-compat.md`
- `docs/plans/2026-04-15-v0.2-automated-upstream-sync-ci.md`
- `planning/active/dual-worktree-delivery/task_plan.md`
- `planning/active/dual-worktree-delivery/progress.md`

## Visual/Browser Findings
- No browser-only findings yet; all current findings came from local plan documents and git state.

---
<!-- 
  REMINDER: The 2-Action Rule
  After every 2 view/browser/search operations, you MUST update this file.
  This prevents visual information from being lost when context resets.
-->
*Update this file after every 2 view/browser/search operations*
*This prevents visual information from being lost*

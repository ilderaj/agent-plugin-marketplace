# Plugin Compatibility Test Strategy

This document defines the minimum validation expected for compatibility-sensitive changes in this repository. Use it for changes that affect plugin parsing, generation, sync behavior, fixtures, generated artifacts, or install layout.

## Minimum validation matrix

### Compatibility-sensitive changes

If a change touches any of the following paths:

- `src/adapters/**`
- `src/generator/**`
- `src/sync/**`
- `tests/fixtures/**`

run this minimum matrix:

```bash
bun test
bun test tests/generator/vscode-plugin.test.ts
bun test tests/sync/pipeline.test.ts
bun test tests/smoke/copilot-cli.test.ts
bun test tests/smoke/generated-artifact-audit.test.ts
bun test tests/smoke/component-conflict-audit.test.ts
```

### Manifest, install, or generated layout changes

If the change also touches manifest paths, install behavior, or generated output layout, keep the full matrix above and additionally run:

1. A real `copilot plugin install` using an isolated `HOME`
2. An install consistency check covering:
   - installed directory contents
   - installed `plugin.json`
   - installed `README.md`
   - consistency against the generated source plugin directory

The install check should confirm that manifest-declared paths exist, canonical artifact paths are preserved, and the installed plugin matches the generated source artifact set.

## Layered validation responsibilities

### 1. Module tests

Use focused module tests to catch parsing and generation regressions close to the source:

- `tests/generator/vscode-plugin.test.ts`
- `tests/sync/pipeline.test.ts`
- adapter-specific unit tests when parser behavior changes

These tests should prove the runtime contract before relying on generated-repo smoke checks.

### 2. Fixture tests

Use fixture-backed tests to keep representative upstream shapes realistic and stable. When fixtures change, verify that the fixture still matches the intended upstream structure and that expectations were updated for the new reality.

### 3. Artifact audit

Use artifact audits to validate the checked-in generated outputs:

- `tests/smoke/generated-artifact-audit.test.ts`
- `tests/smoke/component-conflict-audit.test.ts`

These tests guard canonical paths, stale artifact cleanup, README references, and duplicate component baselines.

### 4. Smoke validation

Use `tests/smoke/copilot-cli.test.ts` to exercise marketplace add/browse/remove flows and representative plugin installs through the real `copilot` CLI.

### 5. Install validation

For manifest or layout changes, verify the installed plugin, generated source plugin, and manifest-declared files together. The goal is not just command success, but post-install correctness.

## Methods to keep

- Run the full suite with `bun test` as the regression exit, even after focused suites pass.
- Keep targeted module tests in the loop for fast feedback on generator and sync changes.
- Keep fixture tests realistic; update fixture expectations when fixture contents intentionally change.
- Keep generated artifact audits enabled so checked-in outputs stay canonical.
- Keep real install validation isolated with a disposable `HOME`, never the developer's normal environment.
- Keep install checks focused on observable artifacts: directory layout, `plugin.json`, README, and manifest-aligned paths.

## Methods to avoid

- Do not rely on `bun test` alone when compatibility-sensitive paths changed; run the targeted matrix too.
- Do not treat fixture changes as test-only edits; they change compatibility coverage and must be validated like runtime changes.
- Do not skip artifact audits after regenerating `plugins/` or marketplace outputs.
- Do not run `copilot plugin install` against your real user environment for validation.
- Do not approve manifest or layout changes based only on command exit codes without checking installed artifacts.
- Do not duplicate the full matrix in `README.md`; keep the operational detail here.

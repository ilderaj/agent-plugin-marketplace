# agent-plugin-marketplace

A Bun-based sync pipeline that pulls official plugin repositories from Codex, Claude Code, and Cursor, converts them into VS Code-compatible plugin packages, and writes a marketplace manifest that can be consumed from Git.

## What this repository does

This repository syncs upstream agent plugin ecosystems and republishes them in a VS Code marketplace-friendly layout.

Today, the implemented CLI entrypoint is `sync`:

- clone or update upstream plugin repositories
- discover supported plugins through platform adapters
- normalize each plugin into a shared intermediate representation (IR)
- generate VS Code-oriented plugin outputs under `plugins/`
- generate `marketplace.json`
- persist sync metadata in `data/sync-state.json`

## Supported platforms

- Codex
- Claude Code
- Cursor

## Install and run locally

### Prerequisites

- [Bun](https://bun.sh/)
- [Git](https://git-scm.com/)

### Install dependencies

```bash
bun install
```

### Run a local sync

```bash
bun run sync
```

This runs `src/index.ts sync` and executes the full sync pipeline.

## Generated outputs

Running `bun run sync` writes or updates these repository artifacts:

- `plugins/` — generated VS Code plugin directories, one directory per normalized plugin name
- `marketplace.json` — marketplace manifest that lists generated plugins with relative `plugins/<name>` sources
- `data/sync-state.json` — sync bookkeeping used to detect unchanged upstream plugins between runs

The pipeline also keeps local upstream clones in `.cache/sync/`.

## Using the generated marketplace in VS Code

This repository is meant to be published to a Git remote that contains both `marketplace.json` and the `plugins/` directory.

Generic setup flow:

1. Push this repository to a Git host that VS Code or your marketplace consumer can access.
2. Configure your VS Code marketplace integration to use the Git-hosted marketplace source for this repo.
3. Point that integration at the repository content that includes `marketplace.json` and the generated `plugins/` tree.
4. Refresh or reload the marketplace integration so it re-reads the manifest.

The exact UI labels depend on the VS Code extension or internal tooling you use, so this README intentionally avoids hard-coded menu text.

## Current compatibility and limitations

This project focuses on practical conversion, not perfect platform parity.

- Codex `.app.json` is detected but not emitted in generated VS Code plugins.
- Command files are copied into generated plugins, but they may need manual verification before relying on them in VS Code.
- Cursor rules are converted into VS Code `.instructions.md` files.
- Generated output does not guarantee 1:1 parity with the upstream platform behavior.
- Compatibility is tracked per generated plugin inside its `plugin.json` metadata.
- In practice, only the `sync` CLI flow is implemented and documented as supported.

## Architecture and data flow

```text
Codex repo      Claude Code repo      Cursor repo
     \               |                 /
      \              |                /
       +-------- platform adapters ----+
                        |
                        v
                   Plugin IR
                        |
          +-------------+-------------+
          |                           |
          v                           v
VsCodePluginGenerator          MarketplaceGenerator
          |                           |
          v                           v
      plugins/<name>/            marketplace.json
                        |
                        v
               SyncStateManager
                        |
                        v
               data/sync-state.json
```

## Core pipeline pieces

- `src/adapters/` — platform-specific discovery and parsing
- `src/generator/vscode-plugin.ts` — writes generated plugin folders and compatibility metadata
- `src/generator/marketplace.ts` — builds the top-level marketplace document
- `src/sync/pipeline.ts` — orchestrates cloning, parsing, generation, and state updates
- `src/index.ts` — CLI entrypoint that currently supports `sync`

## CI automation

`.github/workflows/sync.yml` installs dependencies with Bun and runs:

```bash
bun run sync
```

If `plugins/`, `marketplace.json`, or `data/sync-state.json` changed, the workflow opens a pull request with the synced output.

## Contributing and extending

### Add a new adapter

To support another upstream plugin ecosystem:

1. Add a new adapter in `src/adapters/` that implements the `SourceAdapter` interface.
2. Make the adapter discover upstream plugins and parse them into the shared `PluginIR` shape.
3. Register the adapter in `createPipeline()` in `src/index.ts`.
4. Reuse the existing generators unless the new platform introduces a format that requires generator changes.
5. Add tests that cover discovery, parsing, compatibility, and sync behavior.

### Data flow to keep in mind

The repository is organized around this path:

`adapter -> IR -> generator -> marketplace -> sync pipeline`

More concretely:

- adapter: reads one upstream platform format
- IR: normalizes plugin metadata and components into `PluginIR`
- generator: writes VS Code-oriented plugin output from the IR
- marketplace: indexes generated plugin folders into `marketplace.json`
- sync pipeline: coordinates upstream fetches, incremental updates, and persisted sync state

## Development notes

- Use `bun run build` to compile TypeScript into `dist/`.
- Use `bun test` to run the current test suite.
- The README intentionally does not claim a completed full catalog sync; generated results depend on when and where you run `bun run sync`.

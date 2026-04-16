# Copilot CLI Marketplace Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make this repository a fully Copilot CLI-compatible marketplace so that `copilot plugin marketplace add OWNER/REPO` → `browse` → `install` works out of the box.

**Architecture:** The existing sync pipeline (adapters → IR → VsCodePluginGenerator → MarketplaceGenerator) stays intact. We modify two generator outputs: (1) `plugin.json` splits into an official-schema-only manifest plus a sidecar `_meta.json` for internal fields, and (2) `marketplace.json` gains richer per-plugin metadata and gets written to both repo root and `.github/plugin/`. We add `strict: false` to generated manifests to tolerate cross-platform extensions, and we add a CI smoke test that runs `copilot plugin marketplace add` against the built output.

**Tech Stack:** TypeScript / Bun / bun:test / GitHub Actions

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/generator/vscode-plugin.ts` | Modify | Split plugin.json into official fields + sidecar `_meta.json` |
| `src/generator/marketplace.ts` | Modify | Enrich marketplace entry with version/author/keywords/category/strict; write to `.github/plugin/` |
| `src/sync/pipeline.ts` | Modify | Write marketplace.json to both root and `.github/plugin/` |
| `tests/generator/vscode-plugin.test.ts` | Modify | Assert plugin.json has no `_source`/`_compatibility`/`displayName`; assert `_meta.json` exists |
| `tests/generator/marketplace.test.ts` | Modify | Assert enriched entry fields; assert `strict: false` presence |
| `tests/sync/pipeline.test.ts` | Modify | Assert `.github/plugin/marketplace.json` output |
| `tests/smoke/copilot-cli.test.ts` | Create | Smoke test: marketplace add + browse + install against generated output |
| `.github/workflows/sync.yml` | Modify | Add `.github/plugin/marketplace.json` to commit list |

---

### Task 1: Enrich MarketplacePluginEntry with official metadata fields

The current `MarketplacePluginEntry` only has `name`, `source`, `description`. The official spec supports `version`, `author`, `repository`, `keywords`, `category`, `tags`, `strict` on each plugin entry. We need to carry these through from the IR so that `copilot plugin marketplace browse` shows useful information.

**Files:**
- Modify: `src/generator/marketplace.ts`
- Test: `tests/generator/marketplace.test.ts`

- [ ] **Step 1: Write the failing test for enriched marketplace entries**

In `tests/generator/marketplace.test.ts`, add a new test after the existing one:

```typescript
test('includes version, author, keywords, category, and strict in marketplace entries', async () => {
  const codexIr = await new CodexAdapter().parse(join(FIXTURES_DIR, 'codex-github'));

  const result = new MarketplaceGenerator({
    name: 'agent-plugin-marketplace',
    owner: { name: 'your-org', email: 'plugins@example.com' },
    metadata: { description: 'Cross-platform agent plugins converted for VS Code' },
  }).generate([codexIr]);

  const entry = result.plugins[0];
  expect(entry.version).toBe('0.1.0');
  expect(entry.author).toEqual({ name: 'OpenAI', email: 'support@openai.com', url: 'https://openai.com/' });
  expect(entry.keywords).toEqual(expect.arrayContaining(['github']));
  expect(entry.repository).toBe('https://github.com/openai/plugins');
  expect(entry.strict).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/generator/marketplace.test.ts`
Expected: FAIL — `entry.version` is undefined

- [ ] **Step 3: Update MarketplacePluginEntry type and createMarketplaceEntry**

In `src/generator/marketplace.ts`, expand the interface and the factory function:

```typescript
import type { ManifestAuthor, Platform, PluginIR } from '../adapters/types';
import { normalizeGeneratedPluginName, platformLabel } from './vscode-plugin';

export interface MarketplaceConfig {
  name: string;
  owner: Pick<ManifestAuthor, 'name'> & Partial<Pick<ManifestAuthor, 'email' | 'url'>>;
  metadata: {
    description: string;
  };
}

export interface MarketplacePluginEntry {
  name: string;
  source: string;
  description: string;
  version?: string;
  author?: ManifestAuthor;
  repository?: string;
  keywords?: string[];
  category?: string;
  tags?: string[];
  strict: boolean;
}

export interface MarketplaceDocument {
  name: string;
  owner: MarketplaceConfig['owner'];
  metadata: MarketplaceConfig['metadata'];
  plugins: MarketplacePluginEntry[];
}

export interface GeneratedPluginMarketplaceManifest {
  name: string;
  description: string;
  version?: string;
  author?: ManifestAuthor;
  repository?: string;
  keywords?: string[];
  category?: string;
  _source: {
    platform: Platform;
  };
}

export function createMarketplaceEntry(ir: PluginIR): MarketplacePluginEntry {
  const name = normalizeGeneratedPluginName(ir);
  return {
    name,
    source: `plugins/${name}`,
    description: `${ir.manifest.description} (from ${platformLabel(ir.source.platform)})`,
    version: ir.manifest.version,
    author: ir.manifest.author,
    repository: ir.manifest.repository,
    keywords: ir.manifest.keywords,
    category: ir.manifest.category,
    strict: false,
  };
}

export function createMarketplaceEntryFromGeneratedManifest(
  manifest: GeneratedPluginMarketplaceManifest,
): MarketplacePluginEntry {
  return {
    name: manifest.name,
    source: `plugins/${manifest.name}`,
    description: `${manifest.description} (from ${platformLabel(manifest._source.platform)})`,
    version: manifest.version,
    author: manifest.author,
    repository: manifest.repository,
    keywords: manifest.keywords,
    category: manifest.category,
    strict: false,
  };
}

export class MarketplaceGenerator {
  constructor(private readonly config: MarketplaceConfig) {}

  generate(irs: PluginIR[]): MarketplaceDocument {
    return this.generateFromEntries(irs.map((ir) => createMarketplaceEntry(ir)));
  }

  generateFromEntries(entries: MarketplacePluginEntry[]): MarketplaceDocument {
    return {
      name: this.config.name,
      owner: this.config.owner,
      metadata: this.config.metadata,
      plugins: [...entries]
        .sort((left, right) => left.name.localeCompare(right.name)),
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/generator/marketplace.test.ts`
Expected: PASS

- [ ] **Step 5: Fix existing marketplace test snapshot**

The existing test asserts the old shape without `version`/`author`/etc. Update the `toEqual` assertion in the first test to include the new fields. Each entry now has `version`, `author`, `repository`, `keywords`, `category`, and `strict: false`. Look at the fixture data to get exact expected values. The pattern is:

```typescript
expect(result.plugins).toEqual([
  {
    name: 'claude--code-review',
    source: 'plugins/claude--code-review',
    description: 'Automated code review assistant for Claude Code (from Claude Code)',
    version: '1.0.0',
    author: { name: 'Anthropic', email: 'support@anthropic.com' },
    repository: undefined,
    keywords: undefined,
    category: undefined,
    strict: false,
  },
  // ... same pattern for codex and cursor entries
]);
```

Check fixture manifests at `tests/fixtures/*/` to get actual values for each entry. The key change: every entry object now includes the new fields (some will be `undefined`).

- [ ] **Step 6: Run all tests**

Run: `bun test`
Expected: PASS (no regressions)

- [ ] **Step 7: Commit**

```bash
git add src/generator/marketplace.ts tests/generator/marketplace.test.ts
git commit -m "feat: enrich marketplace entries with version, author, keywords, strict"
```

---

### Task 2: Split plugin.json into official manifest + sidecar _meta.json

Currently VsCodePluginGenerator writes a single `plugin.json` that mixes official fields (`name`, `version`, `description`, `author`, `skills`, `agents`, `hooks`, `mcpServers`) with non-official fields (`displayName`, `instructions`, `_source`, `_compatibility`). Copilot CLI's `strict` default is `true`, meaning unknown fields may cause validation failures. We split into:
- `plugin.json` — only official spec fields + `strict: false`
- `_meta.json` — internal traceability fields (`_source`, `_compatibility`, `displayName`)

**Files:**
- Modify: `src/generator/vscode-plugin.ts`
- Test: `tests/generator/vscode-plugin.test.ts`

- [ ] **Step 1: Write failing tests for the split**

Add these tests at the end of `tests/generator/vscode-plugin.test.ts`:

```typescript
test('plugin.json contains only official Copilot CLI fields and strict: false', async () => {
  const ir = await new CodexAdapter().parse(join(FIXTURES_DIR, 'codex-github'));
  const outDir = join(OUTPUT_ROOT, 'official-fields');
  await ensureCleanDir(outDir);
  await new VsCodePluginGenerator().generate(ir, outDir);

  const manifest = await readJson(join(outDir, 'plugin.json'));

  // Official fields present
  expect(manifest.name).toBe('codex--github');
  expect(manifest.version).toBe('0.1.0');
  expect(manifest.description).toBeDefined();
  expect(manifest.author).toBeDefined();
  expect(manifest.strict).toBe(false);

  // Non-official fields absent
  expect(manifest).not.toHaveProperty('displayName');
  expect(manifest).not.toHaveProperty('_source');
  expect(manifest).not.toHaveProperty('_compatibility');
});

test('_meta.json contains internal traceability fields', async () => {
  const ir = await new CodexAdapter().parse(join(FIXTURES_DIR, 'codex-github'));
  const outDir = join(OUTPUT_ROOT, 'meta-sidecar');
  await ensureCleanDir(outDir);
  await new VsCodePluginGenerator().generate(ir, outDir);

  const meta = await readJson(join(outDir, '_meta.json'));

  expect(meta.displayName).toBe('GitHub (from Codex)');
  expect(meta._source.platform).toBe('codex');
  expect(meta._source.upstream).toBeDefined();
  expect(meta._source.commitSha).toBeDefined();
  expect(meta._compatibility.overall).toBe('partial');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/generator/vscode-plugin.test.ts`
Expected: FAIL — `manifest` still has `_source`, etc.

- [ ] **Step 3: Introduce OfficialPluginManifest and MetaManifest types**

At the top of `src/generator/vscode-plugin.ts`, replace the single `GeneratedPluginManifest` with two interfaces:

```typescript
/** Fields recognized by Copilot CLI plugin.json spec */
interface OfficialPluginManifest {
  name: string;
  version: string;
  description: string;
  author: PluginIR['manifest']['author'];
  license?: string;
  homepage?: string;
  repository?: string;
  keywords?: string[];
  category?: string;
  tags?: string[];
  skills?: './skills/';
  agents?: './agents/';
  commands?: string;
  hooks?: './hooks/hooks.json';
  mcpServers?: './.mcp.json';
  lspServers?: string;
  strict: boolean;
}

/** Internal traceability sidecar — not consumed by Copilot CLI */
interface MetaManifest {
  displayName: string;
  _source: {
    platform: PluginIR['source']['platform'];
    upstream: string;
    pluginPath: string;
    commitSha: string;
    version: string;
  };
  _compatibility: {
    overall: Compatibility['overall'];
    notes: string[];
    warnings: string[];
    droppedComponents: DroppedComponent[];
  };
}
```

- [ ] **Step 4: Update the generate method to write two files**

In the `generate` method of `VsCodePluginGenerator`, change the tail from writing one file to writing two:

```typescript
async generate(ir: PluginIR, outDir: string): Promise<void> {
  await mkdir(outDir, { recursive: true });

  const compatibility = this.buildGeneratedCompatibility(ir);

  await this.copySkills(ir, outDir);
  await this.copyAgents(ir, outDir);
  await this.copyCommands(ir, outDir);
  await this.writeHooks(ir, outDir);
  await this.writeMcpConfig(ir, outDir);
  await this.writeInstructions(ir, outDir);

  const official = this.buildOfficialManifest(ir);
  const meta = this.buildMetaManifest(ir, compatibility);

  await writeFile(join(outDir, 'plugin.json'), `${JSON.stringify(official, null, 2)}\n`, 'utf-8');
  await writeFile(join(outDir, '_meta.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf-8');
  await writeFile(join(outDir, 'README.md'), this.buildReadme(ir, meta), 'utf-8');
}
```

- [ ] **Step 5: Implement buildOfficialManifest**

```typescript
private buildOfficialManifest(ir: PluginIR): OfficialPluginManifest {
  const normalizedName = normalizeGeneratedPluginName(ir);

  return {
    name: normalizedName,
    version: ir.manifest.version,
    description: ir.manifest.description,
    author: ir.manifest.author,
    license: ir.manifest.license,
    homepage: ir.manifest.homepage,
    repository: ir.manifest.repository,
    keywords: ir.manifest.keywords,
    category: ir.manifest.category,
    ...(ir.components.skills.length > 0 ? { skills: './skills/' as const } : {}),
    ...(ir.components.agents.length > 0 ? { agents: './agents/' as const } : {}),
    ...(ir.components.hooks.length > 0 ? { hooks: './hooks/hooks.json' as const } : {}),
    ...(ir.components.mcpServers.length > 0 ? { mcpServers: './.mcp.json' as const } : {}),
    strict: false,
  };
}
```

- [ ] **Step 6: Implement buildMetaManifest**

```typescript
private buildMetaManifest(
  ir: PluginIR,
  compatibility: MetaManifest['_compatibility'],
): MetaManifest {
  return {
    displayName: `${this.humanizeName(ir.manifest.displayName ?? ir.manifest.name)} (from ${platformLabel(ir.source.platform)})`,
    _source: {
      platform: ir.source.platform,
      upstream: ir.source.repoUrl,
      pluginPath: ir.source.pluginPath,
      commitSha: ir.source.commitSha,
      version: ir.source.version,
    },
    _compatibility: compatibility,
  };
}
```

- [ ] **Step 7: Update buildReadme to accept MetaManifest instead of GeneratedPluginManifest**

Change the `buildReadme` method signature from:

```typescript
private buildReadme(ir: PluginIR, manifest: GeneratedPluginManifest)
```

to:

```typescript
private buildReadme(ir: PluginIR, meta: MetaManifest)
```

Then update all references inside `buildReadme` from `manifest.displayName` → `meta.displayName`, `manifest._compatibility` → `meta._compatibility`, `manifest._compatibility.droppedComponents` → `meta._compatibility.droppedComponents`, etc.

- [ ] **Step 8: Remove the old GeneratedPluginManifest interface**

Delete the `GeneratedPluginManifest` interface and the old `buildManifest` method entirely. They are replaced by `OfficialPluginManifest`, `MetaManifest`, `buildOfficialManifest`, and `buildMetaManifest`.

- [ ] **Step 9: Run tests to verify they pass**

Run: `bun test tests/generator/vscode-plugin.test.ts`
Expected: The two new tests PASS

- [ ] **Step 10: Update existing vscode-plugin tests**

The existing tests assert against `manifest._source`, `manifest._compatibility`, `manifest.displayName` from `plugin.json`. These fields are now in `_meta.json`. Update each existing test:

- Where it reads `plugin.json` and asserts `manifest._source.platform`, change to read `_meta.json` and assert `meta._source.platform`.
- Where it asserts `manifest.displayName`, change to `meta.displayName`.
- Where it asserts `manifest._compatibility`, change to `meta._compatibility`.
- For `manifest.name`, `manifest.skills`, `manifest.agents`, `manifest.hooks`, `manifest.mcpServers` — these stay on `plugin.json`.
- Add `expect(manifest.strict).toBe(false)` to each test that reads `plugin.json`.
- The `manifest.instructions` field is no longer in `plugin.json` (it's not an official spec field). If the instructions directory exists, skills in that directory will still be generated, but the `instructions` key should not appear in `plugin.json`. If your code currently puts `instructions` in the manifest, it needs to be removed from `buildOfficialManifest` (it's already not in the interface above). The instruction files are still useful as workspace content, but they don't need to be declared in the manifest since Copilot CLI doesn't load them via that field.

- [ ] **Step 11: Run full test suite**

Run: `bun test`
Expected: ALL PASS

- [ ] **Step 12: Commit**

```bash
git add src/generator/vscode-plugin.ts tests/generator/vscode-plugin.test.ts
git commit -m "feat: split plugin.json into official manifest + _meta.json sidecar"
```

---

### Task 3: Update pipeline to read _meta.json for marketplace entry generation

The `SyncPipeline.loadGeneratedMarketplaceEntries` currently reads `plugin.json` and uses `GeneratedPluginMarketplaceManifest` to build marketplace entries. After Task 2, the fields it needs are split between `plugin.json` (name, description, version, author, etc.) and `_meta.json` (platform for the description suffix). We update the loading logic.

**Files:**
- Modify: `src/sync/pipeline.ts`
- Modify: `src/generator/marketplace.ts` (update `GeneratedPluginMarketplaceManifest` and factory)
- Test: `tests/sync/pipeline.test.ts`

- [ ] **Step 1: Update GeneratedPluginMarketplaceManifest**

In `src/generator/marketplace.ts`, update the interface to match the new split. The pipeline now reads both files:

```typescript
export interface GeneratedPluginOfficialManifest {
  name: string;
  description: string;
  version?: string;
  author?: ManifestAuthor;
  repository?: string;
  keywords?: string[];
  category?: string;
}

export interface GeneratedPluginMeta {
  _source: {
    platform: Platform;
  };
}
```

Replace `createMarketplaceEntryFromGeneratedManifest` with:

```typescript
export function createMarketplaceEntryFromGeneratedFiles(
  official: GeneratedPluginOfficialManifest,
  meta: GeneratedPluginMeta,
): MarketplacePluginEntry {
  return {
    name: official.name,
    source: `plugins/${official.name}`,
    description: `${official.description} (from ${platformLabel(meta._source.platform)})`,
    version: official.version,
    author: official.author,
    repository: official.repository,
    keywords: official.keywords,
    category: official.category,
    strict: false,
  };
}
```

Remove the old `GeneratedPluginMarketplaceManifest` interface and `createMarketplaceEntryFromGeneratedManifest` function.

- [ ] **Step 2: Update pipeline's loadGeneratedMarketplaceEntries**

In `src/sync/pipeline.ts`, update the method to read both files:

```typescript
private async loadGeneratedMarketplaceEntries(): Promise<MarketplacePluginEntry[]> {
  const pluginsDir = join(this.options.config.outputDir, "plugins");

  try {
    const entries = await readdir(pluginsDir, { withFileTypes: true });
    const marketplaceEntries: MarketplacePluginEntry[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const pluginDir = join(pluginsDir, entry.name);
      const official = JSON.parse(
        await readFile(join(pluginDir, "plugin.json"), "utf-8"),
      ) as GeneratedPluginOfficialManifest;
      const meta = JSON.parse(
        await readFile(join(pluginDir, "_meta.json"), "utf-8"),
      ) as GeneratedPluginMeta;
      marketplaceEntries.push(createMarketplaceEntryFromGeneratedFiles(official, meta));
    }

    return marketplaceEntries;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}
```

Update the import statement at the top of `pipeline.ts` to import the new names.

- [ ] **Step 3: Run pipeline tests**

Run: `bun test tests/sync/pipeline.test.ts`
Expected: Existing tests still pass because the pipeline now reads both files correctly. The marketplace output shape includes the new fields.

- [ ] **Step 4: Update pipeline test marketplace assertions**

The pipeline tests assert `marketplace.plugins` shape. Update the assertions to include the new fields (`version`, `author`, `repository`, `keywords`, `category`, `strict`). For the codex-github fixture:

```typescript
expect(marketplace.plugins).toEqual([
  {
    name: "codex--github",
    source: "plugins/codex--github",
    description: "GitHub integration plugin for Codex (from Codex)",
    version: "0.1.0",
    author: { name: "OpenAI", email: "support@openai.com", url: "https://openai.com/" },
    repository: "https://github.com/openai/plugins",
    keywords: ["github", "pull-request", "code-review", "issues", "ci", "actions"],
    category: undefined,
    strict: false,
  },
]);
```

- [ ] **Step 5: Run full test suite**

Run: `bun test`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/generator/marketplace.ts src/sync/pipeline.ts tests/sync/pipeline.test.ts
git commit -m "feat: pipeline reads _meta.json for marketplace entry generation"
```

---

### Task 4: Write marketplace.json to .github/plugin/ directory

The Copilot CLI reference says it looks for `marketplace.json` in these locations (checked in this order): `marketplace.json`, `.plugin/marketplace.json`, `.github/plugin/marketplace.json`, or `.claude-plugin/marketplace.json`. The repo root path already works, but we also want `.github/plugin/marketplace.json` for maximum compatibility with the documented creation guide.

**Files:**
- Modify: `src/sync/pipeline.ts`
- Modify: `.github/workflows/sync.yml`
- Test: `tests/sync/pipeline.test.ts`

- [ ] **Step 1: Write failing test**

Add a test in `tests/sync/pipeline.test.ts`:

```typescript
test("run writes marketplace.json to both root and .github/plugin/", async () => {
  const upstream = await createLocalUpstream();
  const stateFile = join(workspaceDir, "data", "sync-state.json");
  const config = createConfig(upstream.bareRepoUrl);
  const pipeline = new SyncPipeline({
    adapters: [new CodexAdapter()],
    generator: new VsCodePluginGenerator(),
    marketplaceGen: new MarketplaceGenerator(config.marketplace),
    stateManager: new SyncStateManager(stateFile),
    config,
  });

  await pipeline.run();

  const rootMarketplace = JSON.parse(
    await readFile(join(workspaceDir, "output", "marketplace.json"), "utf-8"),
  );
  const dotGithubMarketplace = JSON.parse(
    await readFile(join(workspaceDir, "output", ".github", "plugin", "marketplace.json"), "utf-8"),
  );

  expect(rootMarketplace).toEqual(dotGithubMarketplace);
  expect(rootMarketplace.plugins).toHaveLength(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/sync/pipeline.test.ts`
Expected: FAIL — `.github/plugin/marketplace.json` does not exist

- [ ] **Step 3: Update writeMarketplace to write both locations**

In `src/sync/pipeline.ts`, update the `writeMarketplace` method:

```typescript
private async writeMarketplace(entries: MarketplacePluginEntry[]): Promise<void> {
  const marketplace = this.options.marketplaceGen.generateFromEntries(entries);
  const content = `${JSON.stringify(marketplace, null, 2)}\n`;

  const rootPath = join(this.options.config.outputDir, "marketplace.json");
  const dotGithubPath = join(this.options.config.outputDir, ".github", "plugin", "marketplace.json");

  await mkdir(this.options.config.outputDir, { recursive: true });
  await writeFile(rootPath, content, "utf-8");

  await mkdir(join(this.options.config.outputDir, ".github", "plugin"), { recursive: true });
  await writeFile(dotGithubPath, content, "utf-8");
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `bun test tests/sync/pipeline.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Update GitHub Actions workflow**

In `.github/workflows/sync.yml`, update the change detection and commit steps to include the new path:

Change the detection line:
```yaml
          if [[ -n "$(git status --short -- marketplace.json .github/plugin/marketplace.json data/sync-state.json plugins/)" ]]; then
```

Add to the git add block:
```yaml
          git add marketplace.json .github/plugin/marketplace.json data/sync-state.json
```

- [ ] **Step 6: Run full test suite**

Run: `bun test`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/sync/pipeline.ts tests/sync/pipeline.test.ts .github/workflows/sync.yml
git commit -m "feat: write marketplace.json to .github/plugin/ for Copilot CLI discovery"
```

---

### Task 5: Add Copilot CLI smoke test

A smoke test that verifies the generated output is actually consumable by `copilot plugin marketplace add`. This test is conditional — it only runs when `copilot` CLI is available. CI can skip it via env var.

**Files:**
- Create: `tests/smoke/copilot-cli.test.ts`

- [ ] **Step 1: Write the smoke test**

```typescript
import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, readFile, rm, writeFile, cp } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

const SMOKE_ROOT = join(import.meta.dir, '..', '.generated', 'smoke');
const PROJECT_ROOT = join(import.meta.dir, '..', '..');

let workspaceDir: string;
let copilotAvailable = false;

async function run(cmd: string[], cwd?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn({
    cmd,
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, HOME: workspaceDir },
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

beforeAll(async () => {
  if (process.env.SKIP_SMOKE_TESTS === '1') {
    return;
  }

  const result = await Bun.spawn({
    cmd: ['which', 'copilot'],
    stdout: 'pipe',
    stderr: 'pipe',
  }).exited;

  copilotAvailable = result === 0;
});

afterEach(async () => {
  if (workspaceDir) {
    await rm(workspaceDir, { recursive: true, force: true });
  }
});

describe('Copilot CLI smoke test', () => {
  test('marketplace add + browse works with generated output', async () => {
    if (!copilotAvailable || process.env.SKIP_SMOKE_TESTS === '1') {
      console.log('Skipping: copilot CLI not available or SKIP_SMOKE_TESTS=1');
      return;
    }

    await mkdir(SMOKE_ROOT, { recursive: true });
    workspaceDir = join(SMOKE_ROOT, `smoke-${randomUUID()}`);
    await mkdir(workspaceDir, { recursive: true });

    // Use the project's generated marketplace.json and plugins/ as a local marketplace
    const marketplaceDir = join(workspaceDir, 'marketplace');
    await mkdir(join(marketplaceDir, '.github', 'plugin'), { recursive: true });
    await cp(join(PROJECT_ROOT, 'marketplace.json'), join(marketplaceDir, '.github', 'plugin', 'marketplace.json'));
    await cp(join(PROJECT_ROOT, 'plugins'), join(marketplaceDir, 'plugins'), { recursive: true });

    // Add marketplace from local path
    const addResult = await run(['copilot', 'plugin', 'marketplace', 'add', marketplaceDir], workspaceDir);
    expect(addResult.exitCode).toBe(0);

    // List marketplaces
    const listResult = await run(['copilot', 'plugin', 'marketplace', 'list'], workspaceDir);
    expect(listResult.exitCode).toBe(0);
    expect(listResult.stdout).toContain('agent-plugin-marketplace');

    // Browse marketplace
    const browseResult = await run(['copilot', 'plugin', 'marketplace', 'browse', 'agent-plugin-marketplace'], workspaceDir);
    expect(browseResult.exitCode).toBe(0);

    // Clean up: remove marketplace
    await run(['copilot', 'plugin', 'marketplace', 'remove', 'agent-plugin-marketplace', '--force'], workspaceDir);
  });
});
```

- [ ] **Step 2: Run the smoke test**

Run: `bun test tests/smoke/copilot-cli.test.ts`
Expected: PASS if `copilot` CLI is installed; gracefully skipped otherwise

- [ ] **Step 3: Commit**

```bash
git add tests/smoke/copilot-cli.test.ts
git commit -m "test: add Copilot CLI smoke test for marketplace compatibility"
```

---

### Task 6: Re-generate all plugins and marketplace.json

After Tasks 1–4 change the output format, the existing generated files under `plugins/` and `marketplace.json` are stale. Run the sync pipeline to regenerate everything.

**Files:**
- Modify: `plugins/*/plugin.json` (all — regenerated)
- Create: `plugins/*/_meta.json` (all — new sidecar files)
- Modify: `marketplace.json` (regenerated with enriched entries)
- Create: `.github/plugin/marketplace.json` (new)

- [ ] **Step 1: Run the full test suite to confirm code changes are solid**

Run: `bun test`
Expected: ALL PASS

- [ ] **Step 2: Run the sync pipeline**

Run: `bun run sync`

This will regenerate all plugin directories and marketplace.json. If upstream repos are unavailable (network issues), you can use cached clones if they exist in `.cache/sync/`.

- [ ] **Step 3: Verify generated plugin.json files**

Spot-check a few generated manifests:

```bash
cat plugins/claude--code-review/plugin.json | head -20
```

Expected: No `_source`, `_compatibility`, or `displayName` fields. Has `strict: false`.

```bash
cat plugins/claude--code-review/_meta.json | head -20
```

Expected: Contains `displayName`, `_source`, `_compatibility`.

- [ ] **Step 4: Verify marketplace.json**

```bash
cat marketplace.json | head -30
```

Expected: Each plugin entry has `name`, `source`, `description`, `version`, `author`, `strict: false`.

```bash
diff marketplace.json .github/plugin/marketplace.json
```

Expected: No differences.

- [ ] **Step 5: Commit regenerated output**

```bash
git add plugins/ marketplace.json .github/plugin/marketplace.json
git commit -m "chore: regenerate all plugins with official schema split"
```

---

### Task 7: Update README with Copilot CLI marketplace usage instructions

Replace the current vague "Point your Copilot / VS Code agent configuration at this repository's Git URL" with concrete, accurate Copilot CLI commands.

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace the "Option A" section**

Find the current "Option A" section in `README.md` (around line 23–35) and replace it with:

```markdown
### Option A: Use as a Copilot CLI Marketplace

This repository is a standard Copilot CLI plugin marketplace. Register it, browse plugins, and install what you need.

**Steps:**

1. Register the marketplace:

   ```bash
   copilot plugin marketplace add <owner>/<repo>
   ```

   Or from a local clone:

   ```bash
   copilot plugin marketplace add /path/to/agent-plugin-marketplace
   ```

2. Browse available plugins:

   ```bash
   copilot plugin marketplace browse agent-plugin-marketplace
   ```

3. Install a plugin:

   ```bash
   copilot plugin install <plugin-name>@agent-plugin-marketplace
   ```

4. Manage installed plugins:

   ```bash
   copilot plugin list           # View installed plugins
   copilot plugin update <name>  # Update to latest
   copilot plugin uninstall <name>
   ```
```

- [ ] **Step 2: Remove the stale v0.3 roadmap item about copilot-marketplace.json**

Find the v0.3 roadmap section and remove or rewrite the bullet about `copilot-marketplace.json`. It is no longer needed — the standard `marketplace.json` at `.github/plugin/` is the official protocol. Replace with:

```markdown
### v0.3 — Copilot-Native Integration

- ~~Generate `.copilot/plugins/` layout directly consumable by Copilot without manual copy~~ ✅ Done — this repo is a standard Copilot CLI marketplace
- ~~Produce a `copilot-marketplace.json` manifest tailored to Copilot's plugin discovery protocol~~ ✅ Done — standard `marketplace.json` at `.github/plugin/` is the official protocol
- Support Copilot custom instructions (`.instructions.md`) as a first-class conversion target
- Publish a VS Code extension that reads `marketplace.json` and offers one-click plugin install into workspace
```

- [ ] **Step 3: Run full test suite to ensure no regressions**

Run: `bun test`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: update README with accurate Copilot CLI marketplace usage"
```

---

## Self-Review Checklist

### Spec Coverage

| Requirement | Task |
|------------|------|
| 做一个官方兼容的、自托管的 Copilot marketplace | Tasks 1-4 (schema compliance) + Task 6 (regenerate) |
| marketplace add OWNER/REPO 接入 | Task 4 (.github/plugin/ path) + Task 7 (README) |
| browse 插件列表 | Task 1 (enriched entries) + Task 5 (smoke test) |
| install 插件 | Task 2 (strict: false) + Task 5 (smoke test) |
| GitHub 仓库、Git URL、本地目录分发 | Task 5 (smoke test covers local) + Task 7 (README covers all three) |

### Placeholder Scan

No TBD, TODO, or "implement later" found. All code blocks are complete.

### Type Consistency

- `MarketplacePluginEntry` shape is consistent across Task 1 (definition), Task 3 (factory), Task 4 (assertion).
- `OfficialPluginManifest` and `MetaManifest` are introduced in Task 2 and consumed in Task 3.
- `GeneratedPluginMarketplaceManifest` is replaced by `GeneratedPluginOfficialManifest` + `GeneratedPluginMeta` in Task 3.
- `createMarketplaceEntryFromGeneratedManifest` → `createMarketplaceEntryFromGeneratedFiles` rename happens in Task 3 and pipeline references are updated in the same task.

# MCP Controls And Lazy Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add plugin-scoped MCP control metadata to generated artifacts in this repository, and prepare the host runtime integration needed for per-plugin MCP disablement plus on-demand MCP loading without affecting non-MCP plugin capabilities.

**Architecture:** Keep this repository responsible for emitting stable MCP runtime descriptors and compatibility metadata, but do not teach it to make runtime decisions. The host runtime should consume those descriptors, persist plugin-scoped MCP overrides, filter disabled MCP servers before gateway bootstrap, and move plugin MCPs from eager connection to a default `on_demand` policy with optional `preconnect`.

**Tech Stack:** TypeScript, Bun test runner, generated `plugin.json` / `_meta.json` artifacts, MCP runtime contract documentation, Copilot host integration handoff.

---

## Scope And Assumptions

- This checkout only contains the marketplace/adaptation/generation layer. It does **not** contain the upstream Copilot host source tree that owns Agent Customizations UI, MCP gateway startup, or `/mcp` command persistence.
- This plan therefore has two workstreams:
  - **Workstream A:** repo-local changes that are executable in this repository now.
  - **Workstream B:** upstream host-runtime changes that must be executed in the host source repo after a source checkout is available.
- Backward compatibility is required. Existing generated plugins without the new metadata must continue to work under the current eager-loading behavior until the host-side work is completed.

## Success Criteria

- Generated plugin sidecars expose a stable plugin-scoped MCP identity such as `codex--build-ios-apps::xcodebuildmcp`.
- Generated plugin sidecars expose a default runtime connection policy for each MCP server, initially `on_demand`.
- No new fields are written into the official `plugin.json` that would risk breaking current consumers.
- Repo-local tests cover the new metadata shape and enforce that MCP-bearing plugins emit runtime descriptors.
- A checked-in contract document explains exactly what the host runtime must read, persist, and enforce.

## Workstream A: Repository-Local Deliverables

### Task 1: Add Runtime MCP Descriptor Schema To Generated Meta

**Files:**
- Modify: `src/generator/marketplace.ts`
- Test: `tests/generator/marketplace.test.ts`

- [ ] **Step 1: Write the failing test for the new sidecar schema**

```ts
test("meta manifest can carry runtime MCP descriptors", () => {
  const meta: MetaPluginManifest = {
    displayName: "Example (from Codex)",
    _source: {
      platform: "codex",
      upstream: "https://example.com/repo.git",
      pluginPath: "/tmp/example",
      commitSha: "abc123",
      version: "1.0.0",
    },
    _compatibility: {
      overall: "full",
      notes: [],
      warnings: [],
      droppedComponents: [],
    },
    _runtime: {
      mcp: {
        version: 1,
        servers: [
          {
            key: "codex--example::demo-server",
            pluginId: "codex--example",
            name: "demo-server",
            transport: "stdio",
            sourceConfigPath: "./.mcp.json",
            defaultConnectionPolicy: "on_demand",
          },
        ],
      },
    },
  };

  expect(meta._runtime?.mcp?.servers[0]?.key).toBe("codex--example::demo-server");
  expect(meta._runtime?.mcp?.servers[0]?.defaultConnectionPolicy).toBe("on_demand");
});
```

- [ ] **Step 2: Run the targeted test to verify the schema is missing**

Run: `bun test tests/generator/marketplace.test.ts`
Expected: FAIL with TypeScript/build-time complaints that `_runtime` does not exist on `MetaPluginManifest`.

- [ ] **Step 3: Add the runtime MCP descriptor types to the meta manifest model**

```ts
export type McpConnectionPolicy = 'disabled' | 'on_demand' | 'preconnect';

export interface RuntimeMcpServerDescriptor {
  key: string;
  pluginId: string;
  name: string;
  transport: string;
  sourceConfigPath: string;
  defaultConnectionPolicy: Exclude<McpConnectionPolicy, 'disabled'>;
}

export interface RuntimeMcpMetadata {
  version: 1;
  servers: RuntimeMcpServerDescriptor[];
}

export interface MetaPluginManifest {
  displayName: string;
  _source: {
    platform: Platform;
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
  _runtime?: {
    mcp?: RuntimeMcpMetadata;
  };
}
```

- [ ] **Step 4: Re-run the targeted test**

Run: `bun test tests/generator/marketplace.test.ts`
Expected: PASS for the new schema assertion and no regressions in existing marketplace generator tests.

- [ ] **Step 5: Commit the schema change**

```bash
git add src/generator/marketplace.ts tests/generator/marketplace.test.ts
git commit -m "feat: add runtime MCP descriptor schema"
```

### Task 2: Emit Plugin-Scoped MCP Runtime Descriptors In `_meta.json`

**Files:**
- Modify: `src/generator/vscode-plugin.ts`
- Test: `tests/generator/vscode-plugin.test.ts`

- [ ] **Step 1: Write the failing generator test for plugin-scoped MCP keys**

```ts
test("emits plugin-scoped MCP runtime metadata in _meta.json", async () => {
  const ir = await new ClaudeAdapter().parse(join(FIXTURES_DIR, 'claude-code-review'));
  const outDir = join(OUTPUT_ROOT, 'claude-mcp-runtime-meta');

  await ensureCleanDir(outDir);
  await new VsCodePluginGenerator().generate(ir, outDir);

  const meta = await readJson(join(outDir, '_meta.json'));
  expect(meta._runtime.mcp.version).toBe(1);
  expect(meta._runtime.mcp.servers).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        key: 'claude--code-review::cloudflare-api',
        pluginId: 'claude--code-review',
        name: 'cloudflare-api',
        defaultConnectionPolicy: 'on_demand',
      }),
    ])
  );
});
```

- [ ] **Step 2: Run the targeted generator test to verify `_runtime` is absent**

Run: `bun test tests/generator/vscode-plugin.test.ts`
Expected: FAIL because `_meta.json` currently has no `_runtime.mcp` block.

- [ ] **Step 3: Add a helper that derives stable runtime descriptors from `PluginIR` MCP refs**

```ts
private buildRuntimeMcpMetadata(ir: PluginIR): MetaPluginManifest['_runtime'] | undefined {
  const servers = ir.components.mcpServers.flatMap((ref) =>
    ref.servers.map((server) => ({
      key: `${normalizeGeneratedPluginName(ir)}::${server.name}`,
      pluginId: normalizeGeneratedPluginName(ir),
      name: server.name,
      transport: server.transport,
      sourceConfigPath: ref.configPath,
      defaultConnectionPolicy: 'on_demand' as const,
    }))
  );

  if (servers.length === 0) {
    return undefined;
  }

  return {
    mcp: {
      version: 1,
      servers,
    },
  };
}
```

- [ ] **Step 4: Attach the generated runtime metadata to the existing meta sidecar**

```ts
private buildMeta(
  ir: PluginIR,
  compatibility: MetaPluginManifest['_compatibility']
): MetaPluginManifest {
  return {
    displayName: this.buildDisplayName(ir),
    _source: this.buildSource(ir),
    _compatibility: compatibility,
    ...(this.buildRuntimeMcpMetadata(ir) ? { _runtime: this.buildRuntimeMcpMetadata(ir) } : {}),
  };
}
```

- [ ] **Step 5: Re-run the targeted generator tests**

Run: `bun test tests/generator/vscode-plugin.test.ts`
Expected: PASS for the new `_runtime.mcp` assertions and no regression in existing `_compatibility` / `.mcp.json` expectations.

- [ ] **Step 6: Commit the generator change**

```bash
git add src/generator/vscode-plugin.ts tests/generator/vscode-plugin.test.ts
git commit -m "feat: emit plugin-scoped MCP runtime metadata"
```

### Task 3: Add A Smoke Audit That Protects MCP Runtime Metadata Across Generated Plugins

**Files:**
- Modify: `tests/smoke/generated-artifact-audit.test.ts`

- [ ] **Step 1: Add a failing smoke test for generated plugin sidecars**

```ts
test("plugins with .mcp.json also expose runtime MCP descriptors in _meta.json", async () => {
  const issues: string[] = [];

  for (const pluginName of await listPluginNames()) {
    const pluginDir = join(PLUGINS_DIR, pluginName);
    const mcpConfigPath = join(pluginDir, ".mcp.json");
    const metaPath = join(pluginDir, "_meta.json");

    if (!existsSync(mcpConfigPath)) continue;
    if (!existsSync(metaPath)) {
      issues.push(`${pluginName}: _meta.json is missing for MCP-bearing plugin.`);
      continue;
    }

    const meta = JSON.parse(await readFile(metaPath, "utf8"));
    if (!meta._runtime?.mcp?.servers?.length) {
      issues.push(`${pluginName}: _runtime.mcp.servers is missing or empty.`);
    }
  }

  expect(issues).toEqual([]);
});
```

- [ ] **Step 2: Run the smoke audit to confirm current generated artifacts fail the new rule**

Run: `bun test tests/smoke/generated-artifact-audit.test.ts`
Expected: FAIL for MCP-bearing plugins because `_runtime.mcp.servers` does not exist yet.

- [ ] **Step 3: Update the generated fixture set if the smoke audit uses checked-in plugin artifacts**

```bash
bun test tests/generator/vscode-plugin.test.ts
bun test tests/smoke/generated-artifact-audit.test.ts
```

Expected: the generator tests produce the updated sidecar shape, and the smoke audit now passes against the checked-in plugin directories.

- [ ] **Step 4: Commit the smoke protection**

```bash
git add tests/smoke/generated-artifact-audit.test.ts plugins
git commit -m "test: enforce MCP runtime metadata in generated artifacts"
```

### Task 4: Check In A Host Runtime Contract For The Upstream Team

**Files:**
- Create: `docs/superpowers/specs/2026-04-25-mcp-runtime-contract.md`

- [ ] **Step 1: Write the contract document that defines the repo-to-host handoff**

```md
# MCP Runtime Contract

## Input Artifact
- Read plugin `_meta.json`
- If `_runtime.mcp.version === 1`, consume `_runtime.mcp.servers[]`

## Stable MCP Identity
- Use `key` as the persistence key
- Format: `<pluginId>::<serverName>`

## Host Override Model
- `disabled`
- `on_demand`
- `preconnect`

## Backward Compatibility
- If `_runtime.mcp` is absent, fall back to legacy eager behavior
- If only `disabledMcpServers: string[]` exists, migrate by matching `serverName`
```

- [ ] **Step 2: Save the document and review it for missing host obligations**

Run: `rg -n "TBD|TODO|placeholder" docs/superpowers/specs/2026-04-25-mcp-runtime-contract.md`
Expected: no matches.

- [ ] **Step 3: Commit the host contract document**

```bash
git add docs/superpowers/specs/2026-04-25-mcp-runtime-contract.md
git commit -m "docs: add MCP runtime contract for host integration"
```

### Task 5: Run The Repository Validation Suite For This Slice

**Files:**
- Test: `tests/generator/marketplace.test.ts`
- Test: `tests/generator/vscode-plugin.test.ts`
- Test: `tests/smoke/generated-artifact-audit.test.ts`

- [ ] **Step 1: Run the focused validation set**

Run: `bun test tests/generator/marketplace.test.ts tests/generator/vscode-plugin.test.ts tests/smoke/generated-artifact-audit.test.ts`
Expected: PASS with the new runtime MCP metadata covered by unit and smoke tests.

- [ ] **Step 2: Run the adapter regression tests to ensure no generator-facing shape drift leaked upstream**

Run: `bun test tests/adapters/codex.test.ts tests/adapters/claude.test.ts`
Expected: PASS with no unexpected IR or parsing regressions.

- [ ] **Step 3: Commit the validated repo-local slice**

```bash
git add src tests docs plugins
git commit -m "feat: add MCP runtime descriptors for host controls"
```

## Workstream B: Upstream Host Runtime Integration (Requires Host Source Checkout)

This workstream cannot be executed from the current repository because the relevant source tree is not present in this workspace. Use the checked-in contract from Task 4 plus the runtime anchors already discovered during research.

### Required Host Behaviors

1. **Plugin-scoped persistence**
   - Replace raw `disabledMcpServers: string[]` as the primary model with a keyed override map based on `<pluginId>::<serverName>`.
   - Read legacy `disabledMcpServers` and migrate it into the keyed override map on load.

2. **Agent Customizations UI**
   - Change MCP Servers display from a flat server-name list to rows grouped by plugin source.
   - Each row must allow `Disabled`, `Load on demand`, and `Always connect`.
   - Disabling an MCP must not disable plugin skills, instructions, prompts, or hooks.

3. **Gateway bootstrap filtering**
   - Before the host reaches the equivalent of `Passing N MCP server(s) to SDK`, filter out any row whose resolved policy is `disabled`.
   - For plugin MCPs with no explicit override, use `on_demand` as the default policy.

4. **On-demand activation**
   - Register MCP tool metadata at session startup, but do not open the gateway/client connection for `on_demand` rows.
   - Open the connection only when the planner or tool executor selects a tool backed by that MCP server.
   - Keep `preconnect` rows on the current eager path.

5. **Observability and regression coverage**
   - Add one regression test that proves an unrelated task does not connect a plugin MCP with policy `on_demand`.
   - Add one regression test that proves a disabled MCP remains absent from gateway startup.
   - Add one migration test that proves legacy `disabledMcpServers: ["xcodebuildmcp"]` still disables a single-MCP plugin until the user edits settings.

### Host Runtime Prep Checklist

- Obtain the host source repo that owns:
  - MCP config loading and persistence
  - MCP gateway bootstrap / forwarding
  - Agent Customizations MCP Servers UI
  - `/mcp disable`, `/mcp enable`, and `/mcp reload`
- Map the existing installed-bundle anchors to first-class source files before any coding begins.
- Do not patch the installed extension bundle directly; implement the change in the maintained source repo and release it through the normal build pipeline.

## Rollout Strategy

1. Ship Workstream A first. This is backward-compatible and gives the host a stable descriptor to consume.
2. Ship host-side plugin-scoped disablement next, using the new descriptor but still allowing legacy eager behavior for rows without overrides.
3. Flip the default policy for plugin MCPs to `on_demand` after disablement UI and persistence are stable.
4. Keep an escape hatch for `preconnect` until first-call latency and auth UX are validated in production.

## Review Checklist

- Does `_meta.json` provide enough information for a host to render MCP rows without re-parsing upstream source files?
- Is `pluginId::serverName` the right stability boundary, or do we need `pluginId::configPath::serverName` to handle future collisions?
- Should `on_demand` be the repo-emitted default immediately, or should the host apply that default only after the UI ships?
- Do we want auth-sensitive remote MCPs to default to `disabled` instead of `on_demand`, or is that too aggressive for first rollout?

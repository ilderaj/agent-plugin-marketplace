# MCP Runtime Contract

**Version:** 1.0  
**Date:** 2026-04-25  
**Status:** Approved  
**Audience:** Upstream host runtime team

---

## Overview

This document defines the handoff contract between the agent plugin marketplace repository (this repo) and the upstream host runtime (Copilot CLI / Copilot Agent platform).

The marketplace repository is responsible for generating stable MCP runtime descriptors in plugin artifacts. The host runtime is responsible for consuming those descriptors, persisting plugin-scoped MCP connection policies, enforcing those policies at gateway bootstrap, and managing MCP lifecycle (eager vs. on-demand connection).

This separation keeps the plugin generation layer stateless while allowing the host to evolve runtime behaviors without requiring generator changes.

---

## Input Artifact

### Reading Plugin Metadata

The host runtime must read the generated `_meta.json` file for each installed plugin.

**Location:** `<plugin-bundle-root>/_meta.json`

**Schema Recognition:**

```typescript
interface MetaPluginManifest {
  displayName: string;
  _source: { /* ... */ };
  _compatibility?: { /* ... */ };
  _runtime?: {
    mcp?: RuntimeMcpMetadata;
  };
}

interface RuntimeMcpMetadata {
  version: 1;
  servers: RuntimeMcpServerDescriptor[];
}

interface RuntimeMcpServerDescriptor {
  key: string;                    // Stable persistence key: `<pluginId>::<serverName>`
  pluginId: string;                // Plugin identifier (normalized name)
  name: string;                    // Server name as declared in .mcp.json
  transport: string;               // Transport protocol (stdio, sse, etc.)
  sourceConfigPath: string;        // Relative path to .mcp.json
  defaultConnectionPolicy: 'on_demand' | 'preconnect';
}
```

**Consumption Rule:**

```typescript
if (meta._runtime?.mcp?.version === 1) {
  // Consume meta._runtime.mcp.servers[]
  const mcpServers = meta._runtime.mcp.servers;
  // Process each server descriptor
} else {
  // _runtime.mcp is absent or has an unknown version
  // Fall back to legacy eager behavior (see Backward Compatibility)
}
```

### No Plugin.json Pollution

The official `plugin.json` manifest must not contain MCP runtime policy fields. All runtime-specific metadata lives exclusively in `_meta.json`.

---

## Stable MCP Identity

### Persistence Key Format

Each MCP server must have a globally unique, stable persistence key:

**Format:** `<pluginId>::<serverName>`

**Example:** `codex--build-ios-apps::xcodebuildmcp`

**Properties:**
- The `key` field in `RuntimeMcpServerDescriptor` is the authoritative persistence key.
- The host must use this key when storing and retrieving user overrides.
- Server names are unique within a plugin; collisions across plugins are prevented by the `pluginId` prefix.

### Key Stability Contract

Once a plugin version emits a particular `key`, that key must remain stable across plugin upgrades unless the MCP server is explicitly removed or renamed by the plugin author.

The host runtime should warn users when a previously-disabled MCP server disappears from a plugin (server removal) or appears under a new key (rename).

---

## Host Override Model

The host runtime must maintain a plugin-scoped override map that allows users to control each MCP server independently.

### Override Storage Schema

```typescript
interface McpConnectionPolicy {
  // Per-server override; if absent, use server's defaultConnectionPolicy
  [key: string]: 'disabled' | 'on_demand' | 'preconnect';
}

// Example storage structure
{
  "codex--build-ios-apps::xcodebuildmcp": "disabled",
  "claude--code-review::code-analyzer": "preconnect",
  "codex--file-editor::filesystem": "on_demand"
}
```

### Policy Resolution

For each MCP server, the host must resolve the effective connection policy:

1. **User Override Exists:** Use the value from the override map.
2. **No Override:** Use `server.defaultConnectionPolicy` from the runtime descriptor.
3. **Fallback (descriptor missing):** Use legacy eager behavior.

**Example:**

```typescript
function resolvePolicy(
  server: RuntimeMcpServerDescriptor,
  overrides: McpConnectionPolicy
): 'disabled' | 'on_demand' | 'preconnect' {
  if (server.key in overrides) {
    return overrides[server.key];
  }
  return server.defaultConnectionPolicy;
}
```

### Policy Semantics

| Policy       | Behavior                                                                 |
|--------------|--------------------------------------------------------------------------|
| `disabled`   | Server is not registered; not visible to the MCP gateway or tool planner |
| `on_demand`  | Server metadata is registered at startup, but connection is deferred until a tool from this server is selected by the planner or explicitly invoked |
| `preconnect` | Server connection is opened eagerly at session startup (legacy behavior) |

---

## Host Responsibilities

The host runtime must implement the following behaviors:

### 1. Plugin-Scoped Persistence

**Responsibility:** Store and retrieve per-server connection policies using the stable `key` format.

**Data Model:** Replace the legacy flat `disabledMcpServers: string[]` with a keyed override map.

**Migration Path:** When loading settings, detect legacy `disabledMcpServers` and migrate entries into the new keyed model (see Backward Compatibility).

**UI Implication:** The Agent Customizations UI must display MCP servers grouped by plugin, allowing users to set individual policies per server.

### 2. Gateway Bootstrap Filtering

**Responsibility:** Before initializing the MCP gateway, filter out any server whose resolved policy is `disabled`.

**Example:**

```typescript
const activeServers = allServers.filter(server => {
  const policy = resolvePolicy(server, userOverrides);
  return policy !== 'disabled';
});
// Pass activeServers to MCP gateway bootstrap
```

### 3. On-Demand Activation

**Responsibility:** For servers with `on_demand` policy, register tool metadata at session startup but defer connection establishment until a tool from that server is invoked.

**Implementation Notes:**
- The host must maintain a lazy connection registry.
- When the planner selects a tool backed by an `on_demand` server, the host must:
  1. Check if the server connection is already open.
  2. If not, open the connection before executing the tool.
  3. Cache the connection for subsequent tool calls.

**Preconnect Path:** Servers with `preconnect` policy should follow the current eager connection behavior.

### 4. UI Display And Control

**Responsibility:** Present MCP servers in the Agent Customizations UI with plugin-scoped grouping and per-server policy controls.

**UI Requirements:**
- Group servers by `pluginId`.
- Display `server.name` and `server.transport` for each server.
- Provide controls to set policy: `Disabled`, `Load on demand`, `Always connect`.
- Clearly indicate that disabling an MCP server does not disable plugin skills, instructions, prompts, or hooks.

### 5. Migration From Legacy Settings

**Responsibility:** Automatically migrate users from the legacy `disabledMcpServers: string[]` model to the new keyed override map.

**Migration Rules:**
- For each entry `serverName` in `disabledMcpServers`, find all servers with `server.name === serverName`.
- Create override entries: `{ [server.key]: 'disabled' }`.
- Preserve the legacy array until all plugins have migrated, then remove it in a future release.

**Ambiguity Handling:** If multiple plugins have an MCP server with the same `name`, the migration must create a disabled override for all matching servers (since the legacy format did not have plugin-scoping).

### 6. Observability And Diagnostics

**Responsibility:** Provide visibility into MCP server lifecycle and policy application.

**Suggested Diagnostics:**
- Log which servers are registered at startup vs. deferred.
- Log when an `on_demand` server is activated.
- Warn when a previously-disabled server is missing from a plugin upgrade.
- Expose MCP connection status in debug output or developer console.

---

## Backward Compatibility

### Missing Runtime Metadata

**Scenario:** A plugin's `_meta.json` does not contain `_runtime.mcp` or contains an unknown version.

**Host Behavior:** Fall back to legacy eager behavior:
- Parse `.mcp.json` directly (if present).
- Connect all MCP servers at session startup.
- Honor legacy `disabledMcpServers: string[]` for server-name-based disablement.

**Rationale:** This ensures plugins generated before this contract was adopted continue to work without changes.

### Legacy DisabledMcpServers Array

**Scenario:** User settings contain `disabledMcpServers: string[]` without keyed overrides.

**Host Behavior:** Treat each entry as a server name match and apply `disabled` policy to all servers with that name, regardless of plugin.

**Migration Path:** On first load after host upgrade, migrate legacy entries into keyed overrides and mark the legacy array as deprecated.

**Example:**

```typescript
// User settings (legacy)
disabledMcpServers: ["xcodebuildmcp", "filesystem"]

// After migration
mcpConnectionPolicies: {
  "codex--build-ios-apps::xcodebuildmcp": "disabled",
  "codex--file-editor::filesystem": "disabled"
}
```

### Incremental Rollout

The host must support a mixed environment where some plugins have runtime descriptors and others do not. The policy resolution logic must handle both cases transparently.

---

## Non-Goals

This repository does not implement and this contract does not define:

- **MCP gateway internals:** Connection pooling, transport negotiation, error handling.
- **Tool planner logic:** Which tools are selected for which tasks.
- **Auth flows:** How MCP servers authenticate or prompt for credentials.
- **Conflict resolution:** How to handle multiple plugins providing overlapping tools.

These are host runtime concerns and must be addressed in the upstream host source repository.

---

## Verification Criteria

The host runtime implementation is considered compliant with this contract when:

1. The host can read `_meta.json` and correctly parse `_runtime.mcp.version === 1` descriptors.
2. User overrides are stored using the stable `key` format (`<pluginId>::<serverName>`).
3. Servers with `disabled` policy are not registered with the MCP gateway.
4. Servers with `on_demand` policy are registered but not connected until a tool is invoked.
5. Servers with `preconnect` policy follow the eager connection path.
6. Legacy `disabledMcpServers` entries are automatically migrated to keyed overrides.
7. Plugins without `_runtime.mcp` fall back to legacy eager behavior without errors.
8. The UI displays MCP servers grouped by plugin and allows per-server policy control.

---

## Example Workflow

### Plugin Generation (This Repository)

```typescript
// src/generator/vscode-plugin.ts
const meta: MetaPluginManifest = {
  displayName: "Build iOS Apps (from Codex)",
  _source: { /* ... */ },
  _runtime: {
    mcp: {
      version: 1,
      servers: [
        {
          key: "codex--build-ios-apps::xcodebuildmcp",
          pluginId: "codex--build-ios-apps",
          name: "xcodebuildmcp",
          transport: "stdio",
          sourceConfigPath: ".mcp.json",
          defaultConnectionPolicy: "on_demand"
        }
      ]
    }
  }
};
// Write to <plugin-root>/_meta.json
```

### Host Consumption (Upstream Host)

```typescript
// Host runtime initialization
const meta = await readJson(`${pluginRoot}/_meta.json`);

if (meta._runtime?.mcp?.version === 1) {
  const servers = meta._runtime.mcp.servers;
  
  for (const server of servers) {
    const policy = resolvePolicy(server, userOverrides);
    
    if (policy === 'disabled') {
      continue; // Skip this server
    }
    
    if (policy === 'on_demand') {
      registerToolMetadata(server); // Register but don't connect
    } else if (policy === 'preconnect') {
      await connectServer(server); // Eager connection
    }
  }
} else {
  // Legacy fallback
  await connectAllServers(pluginRoot);
}
```

### User Override (Settings UI)

```typescript
// User clicks "Disable" on codex--build-ios-apps::xcodebuildmcp
userOverrides["codex--build-ios-apps::xcodebuildmcp"] = "disabled";

// User clicks "Always connect" on claude--code-review::code-analyzer
userOverrides["claude--code-review::code-analyzer"] = "preconnect";

// Save overrides to persistent settings
await saveSettings({ mcpConnectionPolicies: userOverrides });
```

---

## Review And Updates

This contract is versioned and maintained in the marketplace repository. Changes must be reviewed by both the plugin generation team and the host runtime team.

**Version History:**
- **1.0 (2026-04-25):** Initial contract defining `_runtime.mcp.version === 1` and plugin-scoped override model.

**Future Considerations:**
- Support for `pluginId::configPath::serverName` if key collisions become a problem.
- Additional policies: `prompt_for_auth`, `disabled_until_auth`, etc.
- Runtime schema versioning strategy for breaking changes.

---

## Contact

For questions or clarifications, contact the plugin marketplace team or file an issue in the host runtime repository.

# Findings: MCP Auto-Connect Research

## Initial Context
- Existing active planning tasks are unrelated to this investigation.
- No prior repository memory or user memory exists for this behavior.
- The reported symptom is repeated `SSE stream disconnected` errors for plugin MCP clients such as `xcodebuildmcp` and `cloudflare-api` during unrelated agent activity.

## Evidence Log
- Repository generator behavior:
	- `src/generator/vscode-plugin.ts` writes `"mcpServers": "./.mcp.json"` into generated `plugin.json` whenever a plugin has MCP components.
	- The same generator copies the referenced MCP payload into `.mcp.json` without adding any lazy-loading or disable metadata.
- Repository adapter behavior:
	- `src/adapters/codex.ts` and `src/adapters/claude.ts` parse `.mcp.json` into `components.mcpServers` by enumerating declared servers only.
	- Compatibility metadata marks MCP servers as fully compatible components; no per-server enable/disable control exists in this repo.
- Concrete plugin declarations:
	- `plugins/codex--build-ios-apps/.mcp.json` declares `xcodebuildmcp` with a local `npx ... xcodebuildmcp@latest mcp` command.
	- `plugins/codex--cloudflare/.mcp.json` declares `cloudflare-api` as remote HTTP MCP at `https://mcp.cloudflare.com/mcp`.
- Host runtime evidence from VS Code logs:
	- Copilot Chat logs show `loadMcpConfig called. CLIMCPServerEnabled=true` followed by `MCP server forwarding is enabled, using gateway configuration`.
	- The same session logs `Passing 2 MCP server(s) to SDK: [xcodebuildmcp, cloudflare-api]` before any tool-specific action, then immediately starts both remote MCP clients through `http://127.0.0.1:<port>/gateway/<id>`.
	- This explains why `xcodebuildmcp` appears as `type=http` and later fails with `SSE stream disconnected` even though the plugin's own `.mcp.json` declares a stdio command: the host proxies both local and remote MCP servers through a local gateway and the SDK talks to the gateway over HTTP/SSE.
	- Repeated disconnects happen on a roughly five-minute cadence, which indicates a background keepalive/reconnect loop rather than on-demand tool invocation only.
	- Later logs show `Gateway not found`, `Failed to reconnect SSE stream`, and `Maximum reconnection attempts (2) exceeded`, confirming reconnection behavior after gateway teardown.
- OAuth/auth behavior evidence:
	- The dedicated Cloudflare MCP server log shows repeated start attempts followed by OAuth metadata discovery and immediate stop.
	- Renderer warnings report that the Cloudflare server failed to start because user interaction is required for auth.
- Host management capability evidence:
	- The installed Copilot Chat extension bundle contains `disabledMcpServers`, `disableMcpServer()`, and `enableMcpServer()` support in the session/MCP host flow.
	- The same bundle also registers `/mcp disable <server>`, `/mcp enable <server>`, `/mcp reload`, and `/mcp auth <server>` commands.
	- The disable/enable implementation attempts to persist the result by writing `disabledMcpServers` and `enabledMcpServers` into user config. No such entry exists yet in the local user config, which means the feature appears available but unused so far.
	- There is an inconsistency inside the command help text: it advertises persistence across sessions, but another help paragraph says changes only last for the current session. The implementation itself prefers persistence when config writing succeeds.

## Working Conclusion
- In the current VS Code Copilot host, plugin-declared MCP servers are loaded into the session up front and forwarded through a local MCP gateway.
- The host then eagerly creates MCP clients for all forwarded servers in that session; this is not purely lazy per-tool invocation.
- This repository exposes MCP declarations, but it does not itself implement per-server runtime toggles or lazy-connect policy.
- The host runtime does appear to support per-server disable/enable outside this repository, likely through the `/mcp` command surface or MCP management UI.
- The only directly evidenced global switch from logs is `CLIMCPServerEnabled`, which controls whether MCP forwarding is enabled at all.

## Recommended Implementation Shape
- Recommended rollout is two-stage rather than single-shot:
	- Stage 1: add plugin-scoped MCP disablement in Agent Customizations without affecting plugin skills, prompts, hooks, or instructions.
	- Stage 2: move plugin MCPs from eager connection to default `on_demand`, with optional `preconnect` for high-frequency servers.
- Repository-local change should stay declarative:
	- emit stable MCP runtime descriptors in `_meta.json`
	- do not add experimental runtime-control fields to the official `plugin.json`
- Host-runtime change should own policy and persistence:
	- persist overrides by stable key such as `<pluginId>::<serverName>`
	- filter disabled MCPs before gateway bootstrap
	- only connect `on_demand` MCPs when a backed tool is actually selected

## Companion Plan
- Path: `docs/superpowers/plans/2026-04-25-mcp-controls-and-lazy-loading.md`
- Summary: Detailed implementation plan covering repo-local metadata emission, smoke coverage, host contract documentation, and upstream host integration requirements.
- Sync Status: Current with planning files as of 2026-04-25.
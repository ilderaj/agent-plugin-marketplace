# Task: MCP Auto-Connect Research

## Goal
Understand why MCP services inherited from marketplace-installed plugins are repeatedly connected during unrelated agent tasks, and determine whether those MCPs can be disabled individually or are meant to be connected only on demand.

## Current State
Status: waiting_review
Archive Eligible: no
Close Reason:

## Phases
| Phase | Status | Notes |
|-------|--------|-------|
| 1. Establish context | complete | Task files created and initial evidence captured |
| 2. Trace MCP registration path | complete | Repository generator/adapters traced; host session logs confirm forwarding |
| 3. Trace reconnect behavior | complete | Host logs show periodic SSE disconnects and explicit reconnect attempts |
| 4. Assess disable/on-demand options | complete | No per-server toggle found in repo; logs show global forwarding switch only |
| 5. Write report | complete | Research conclusions and exact config path delivered to the user |
| 6. Draft implementation plan | complete | Detailed plan written for user review |

## Companion Plan
- Path: `docs/superpowers/plans/2026-04-25-mcp-controls-and-lazy-loading.md`
- Summary: Splits the solution into repo-local MCP runtime metadata plus an upstream host-runtime integration workstream.
- Sync Status: Synced into `task_plan.md`, `findings.md`, and `progress.md` on 2026-04-25.

## Hypothesis
Initial hypothesis: plugin-provided MCP servers are registered into a shared MCP client pool during plugin loading, and the host attempts to keep those clients connected proactively rather than lazily creating them only when a tool is selected.

## Verification Targets
- Find the code path that loads MCP definitions from installed plugins.
- Find the code path that starts or reconnects MCP clients.
- Find any user-facing setting or manifest field that can disable individual MCP servers.

## Errors Encountered
None blocking.
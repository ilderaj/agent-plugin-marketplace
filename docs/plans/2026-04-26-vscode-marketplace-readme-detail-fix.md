# VS Code Marketplace README Detail Fix

## Summary

This document packages the final diagnosis for the blank pre-install plugin detail page, a minimal reproduction for upstream reporting, and an implementation plan for fixing the host-side bug in VS Code / Copilot.

## Final Diagnosis

The blank detail page is not caused by missing marketplace data in this repository.

Verified facts:

- The generated plugin README exists in the actual cached marketplace clone used by VS Code:
  - `~/.vscode/agent-plugins/github.com/ilderaj/agent-plugin-marketplace/plugins/codex--build-ios-apps/README.md`
- The README is non-empty.
- VS Code's `getMarketplaceReadmeFileUri()` normalization logic resolves to that exact file.
- The marketplace item construction path preserves `readmeUri`.
- The detail editor reads long-form content from README, not from marketplace.json long-description style fields.

Therefore the failure point is in the VS Code / Copilot host README rendering path for marketplace plugin details, not in `agent-plugin-marketplace` generation.

More specifically, the current behavior matches a silent-empty-content failure:

- `AgentPluginEditor.fetchReadme()` returns `''` on read failures instead of surfacing a typed failure.
- `AgentPluginEditor.openMarkdown()` only shows `No README available.` when an exception is thrown.
- If the fetch or markdown render path silently returns empty content, the UI renders a blank body with no fallback messaging.

## Upstream Issue Draft

### Suggested Title

`Agent Plugins: marketplace plugin detail view renders blank body when README loading path returns empty content`

### Suggested Problem Statement

The Agent Plugins detail view can render a blank body for marketplace plugins even when the plugin README exists locally and the computed `readmeUri` is correct. This appears to be caused by the README fetch/render path silently returning empty content instead of surfacing a failure or showing the existing `No README available.` fallback.

### Suggested Reproduction

1. Add a GitHub marketplace that exposes at least one plugin with:
   - a valid marketplace entry
   - a plugin directory under a relative `source`
   - a non-empty `README.md`
2. Open VS Code with Agent Plugin Marketplace enabled.
3. Open the Agent Plugins marketplace view.
4. Open the details page for the plugin.
5. Observe that the header renders, but the README area is blank.

### Verified Reproduction Inputs

Use this marketplace:

- `https://github.com/ilderaj/agent-plugin-marketplace.git`

Use this plugin:

- `codex--build-ios-apps`

Verified local cache state:

- cached repository root: `~/.vscode/agent-plugins/github.com/ilderaj/agent-plugin-marketplace`
- cached branch: `main`
- expected README path: `plugins/codex--build-ios-apps/README.md`
- README exists and is non-empty

### Expected Result

The detail view renders the plugin README body.

### Actual Result

The detail view header renders, but the README body is blank and no fallback message is shown.

### Why This Looks Like a Host Bug

- The marketplace repository contains the README.
- `readmeUri` survives the marketplace item pipeline.
- The host implementation is explicitly designed to render README content for marketplace plugin details.
- The existing fallback copy is only used on thrown exceptions, so a silent empty string naturally produces a blank body.

### Related Issue

- `microsoft/vscode#302312`

That issue is not identical, but it is strong evidence that the Agent Plugin marketplace README detail path already has known defects.

## Minimal Reproduction Package

An upstream-quality minimal reproduction should contain only:

### Repository Shape

```text
minimal-marketplace/
  .github/plugin/marketplace.json
  plugins/
    sample-readme-plugin/
      README.md
      plugin.json
      skills/
        demo/
          SKILL.md
```

### Minimal marketplace.json

```json
{
  "plugins": [
    {
      "name": "sample-readme-plugin",
      "description": "Minimal marketplace plugin for README detail rendering repro.",
      "version": "0.1.0",
      "source": "./plugins/sample-readme-plugin"
    }
  ]
}
```

### Minimal README.md

```md
# Sample README Plugin

This content should appear in the Agent Plugin detail page before install.

## Verification Marker

If the host renders this README correctly, this heading and paragraph should be visible.
```

### Minimal plugin.json

```json
{
  "name": "sample-readme-plugin",
  "description": "Minimal plugin for marketplace README rendering repro.",
  "skills": {
    "paths": [
      "skills"
    ]
  }
}
```

### Minimal SKILL.md

```md
# Demo

Minimal skill content.
```

## Host Fix Recommendation

### Primary Fix Goal

Make the marketplace detail page robust when README loading or markdown rendering produces empty content.

### Recommended Behavior Changes

1. Treat empty README content as a failure state for marketplace detail rendering.
2. Show `No README available.` when README content is empty after fetch and normalization.
3. Add debug logging around `readmeUri`, fetch mode, and rendered content length.
4. Add regression coverage for local cached README URIs and empty-string failures.

### Candidate VS Code Files

- `src/vs/workbench/contrib/chat/browser/agentPluginEditor/agentPluginEditor.ts`
- `src/vs/workbench/contrib/chat/common/plugins/pluginMarketplaceService.ts`
- `src/vs/workbench/contrib/chat/browser/pluginUrlHandler.ts`
- `src/vs/workbench/test/browser/componentFixtures/sessions/aiCustomizationManagementEditor.fixture.ts`

## Implementation Plan

> I'm using the writing-plans skill to create the implementation plan.

# VS Code Marketplace README Detail Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Agent Plugin marketplace detail view so a plugin with a valid README never renders a silent blank body.

**Architecture:** Keep the existing README-based detail architecture, but harden the host pipeline against silent-empty outcomes. The fix should be localized to `AgentPluginEditor` with regression coverage around marketplace plugin items that carry a valid `readmeUri`.

**Tech Stack:** TypeScript, VS Code workbench editor code, existing webview markdown renderer, workbench/browser component fixtures, issue-driven regression testing.

---

### Task 1: Add a regression fixture for marketplace README rendering

**Files:**
- Modify: `src/vs/workbench/test/browser/componentFixtures/sessions/aiCustomizationManagementEditor.fixture.ts`
- Test: `src/vs/workbench/test/browser/componentFixtures/sessions/aiCustomizationManagementEditor.fixture.ts`

- [ ] **Step 1: Add a marketplace item fixture with a concrete `readmeUri`**

Add a fixture item that includes a file-backed README URI instead of relying on an item without README metadata.

```ts
readmeUri: URI.file('/tmp/sample-readme-plugin/README.md')
```

- [ ] **Step 2: Add fixture README content with a unique marker**

Use a deterministic string such as:

```ts
const readmeMarker = 'README_RENDER_MARKER_SAMPLE_PLUGIN';
```

- [ ] **Step 3: Run the affected fixture test or snapshot workflow**

Run the narrowest existing component fixture command that exercises agent plugin detail rendering.

Expected: the current implementation either renders blank content or fails to assert on the marker.

### Task 2: Make empty README content trigger fallback instead of blank UI

**Files:**
- Modify: `src/vs/workbench/contrib/chat/browser/agentPluginEditor/agentPluginEditor.ts`
- Test: `src/vs/workbench/test/browser/componentFixtures/sessions/aiCustomizationManagementEditor.fixture.ts`

- [ ] **Step 1: Harden `fetchReadme()` result handling**

Adjust the logic so empty or whitespace-only README results are treated as missing content.

Suggested shape:

```ts
const text = content.value.toString();
return text.trim().length > 0 ? text : '';
```

And for HTTP fetch:

```ts
const text = await asText(context);
return text && text.trim().length > 0 ? text : '';
```

- [ ] **Step 2: Harden `openMarkdown()` against empty rendered body**

Before creating the webview, reject empty rendered output and fall back to nocontent copy.

Suggested shape:

```ts
const body = await this.renderMarkdown(cacheResult, container, token);
if (!body || body.trim().length === 0) {
  throw new Error('Agent plugin README rendered empty body');
}
```

- [ ] **Step 3: Preserve existing UX fallback**

Keep the existing catch path that renders:

```ts
localize('noReadme', "No README available.")
```

Expected result: blank body is replaced by a deterministic fallback when the pipeline cannot produce content.

### Task 3: Add targeted diagnostics for future failures

**Files:**
- Modify: `src/vs/workbench/contrib/chat/browser/agentPluginEditor/agentPluginEditor.ts`

- [ ] **Step 1: Inject lightweight debug logging around README fetch path**

Log:

- item kind
- `readmeUri`
- scheme
- content length after fetch
- content length after render

Suggested shape:

```ts
this.logService.debug('[agentPluginEditor] README fetch', {
  itemKind: item.kind,
  readmeUri: readmeUri?.toString(),
  scheme: readmeUri?.scheme,
});
```

- [ ] **Step 2: Log empty-content fallback explicitly**

Suggested shape:

```ts
this.logService.warn('[agentPluginEditor] README detail fallback triggered', {
  itemKind: item.kind,
  readmeUri: readmeUri?.toString(),
});
```

Expected result: future reproductions no longer fail silently.

### Task 4: Verify marketplace item pipeline assumptions with a narrow test

**Files:**
- Modify: `src/vs/workbench/contrib/chat/browser/pluginUrlHandler.ts`
- Test: relevant browser/unit test file for `pluginUrlHandler` or marketplace item serialization path

- [ ] **Step 1: Add or update a test asserting `readmeUri` is copied into the editor input item**

Assert that a marketplace plugin item opened from marketplace search or targeted install keeps the same `readmeUri` value.

- [ ] **Step 2: Run the narrow test scope**

Expected: confirms that item transport is not the failing control point.

### Task 5: Regression validation

**Files:**
- Test only

- [ ] **Step 1: Run the narrow agent plugin editor / fixture tests**

Use the narrowest available command for the affected workbench tests.

Expected: new regression coverage passes.

- [ ] **Step 2: Perform one manual verification with a real marketplace**

Manual verification steps:

1. Add `https://github.com/ilderaj/agent-plugin-marketplace.git`
2. Open Agent Plugins marketplace
3. Open `codex--build-ios-apps`
4. Confirm either:
   - README body renders correctly, or
   - explicit `No README available.` fallback is shown

- [ ] **Step 3: Confirm no silent blank body remains**

This is the acceptance gate for the fix.

## Non-Goals

- Adding new marketplace.json long-description schema
- Changing `agent-plugin-marketplace` generator logic as part of the host fix
- Broad refactoring of Agent Plugin marketplace architecture

## Recommended Upstream PR Scope

Keep the first upstream PR narrow:

1. Add regression coverage
2. Harden empty-content handling in `AgentPluginEditor`
3. Add debug logging only if maintainers accept it

Do not combine this with marketplace schema expansion or unrelated marketplace UX changes.
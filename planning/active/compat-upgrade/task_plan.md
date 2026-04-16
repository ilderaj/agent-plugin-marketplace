# Upstream Adapter Compatibility Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正三个 adapter 的兼容性评级，使其准确反映官方文档中各平台的真实能力，同时改进格式转换逻辑。

**Architecture:** 三个 phase 组（A/B/C）。Phase A（Task 1-2）修正 Claude Code adapter 评级和调查 commands 组件，可并行。Phase B（Task 3-4）改进 Codex agent/hooks 格式转换，可并行。Phase C（Task 5）优化 Cursor rules 转换精度。每个 task 独立修改一组文件，无交叉依赖。

**Tech Stack:** TypeScript, Bun test runner, `bun:test` assertions

---

## Phase A: 评级修正与 Commands 调查（可并行）

### Task 1: Claude Code Adapter — hooks 和 agents 评级从 partial → full

**Files:**
- Modify: `src/adapters/claude.ts:325-345` (computeCompatibility hooks/agents sections)
- Modify: `tests/adapters/claude.test.ts:107-125` (compatibility assertion tests)
- Modify: `tests/generator/vscode-plugin.test.ts:74-100` (Claude generator compat assertions)

**Context:** VS Code 原生读取 `.claude/settings.json` hooks 和 `.claude/agents/*.md`，无需格式转换。当前代码硬编码 `partial`，但官方文档证实这些是 `full` 兼容的。

- [ ] **Step 1: Write the failing test for hooks = full**

In `tests/adapters/claude.test.ts`, add a new test after the existing compatibility tests (~line 125):

```typescript
  test('compatibility rates hooks as full (VS Code natively reads Claude hook format)', async () => {
    const ir = await adapter.parse(FIXTURE);
    const hookCompat = ir.compatibility.details.find(d => d.type === 'hook');
    expect(hookCompat).toBeDefined();
    expect(hookCompat?.level).toBe('full');
    expect(hookCompat?.notes).toContain('natively');
  });

  test('compatibility rates agents as full (VS Code natively reads .claude/agents/ format)', async () => {
    const ir = await adapter.parse(FIXTURE);
    const agentCompat = ir.compatibility.details.find(d => d.type === 'agent');
    expect(agentCompat).toBeDefined();
    expect(agentCompat?.level).toBe('full');
    expect(agentCompat?.notes).toContain('natively');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent-plugin-marketplace && bun test tests/adapters/claude.test.ts`

Expected: FAIL — `Expected: "full"` / `Received: "partial"`

- [ ] **Step 3: Update Claude adapter computeCompatibility**

In `src/adapters/claude.ts`, change the hooks section in `computeCompatibility()`:

```typescript
    // Hooks are natively compatible — VS Code reads Claude hook format from .claude/settings.json
    for (const hook of components.hooks) {
      details.push({
        type: 'hook',
        name: hook.configPath,
        level: 'full' as const,
        notes: 'VS Code natively reads Claude hook format from .claude/settings.json',
      });
    }
    
    // Agents are natively compatible — VS Code reads .claude/agents/*.md directly
    for (const agent of components.agents) {
      details.push({
        type: 'agent',
        name: agent.name,
        level: 'full' as const,
        notes: 'VS Code natively reads .claude/agents/*.md format',
      });
    }
```

- [ ] **Step 4: Run adapter test to verify it passes**

Run: `cd agent-plugin-marketplace && bun test tests/adapters/claude.test.ts`

Expected: ALL PASS

- [ ] **Step 5: Fix the existing compatibility test that asserts `partial`**

In `tests/adapters/claude.test.ts`, the test `'compatibility notes explain VS Code relationship'` (around line 107) asserts `hookCompat?.notes` contains `'VS Code'` — that still passes. But `'compatibility overall is partial when components have partial compatibility'` (around line 97) expects `overall` to be `partial`. Now hooks and agents are `full`, but **commands are still `partial`**, so overall should still be `partial` for the existing fixture. Verify this is still true:

The fixture `claude-code-review` has commands (`format.sh`), which stay `partial`. So `overall` remains `partial`. The test at line 97 should still pass with no change needed.

Run: `cd agent-plugin-marketplace && bun test tests/adapters/claude.test.ts`

Expected: ALL PASS

- [ ] **Step 6: Write test for Claude-only-hooks-agents fixture (no commands → full overall)**

In `tests/adapters/claude.test.ts`, add:

```typescript
  test('compatibility overall is full when plugin has only hooks and agents (no commands)', async () => {
    const { mkdir, writeFile, rm } = await import('fs/promises');
    const { tmpdir } = await import('os');
    const { randomBytes } = await import('crypto');

    const tempDir = join(tmpdir(), `test-claude-full-${randomBytes(8).toString('hex')}`);
    const fixture = join(tempDir, 'hooks-agents-only');

    await mkdir(join(fixture, '.claude-plugin'), { recursive: true });
    await mkdir(join(fixture, 'hooks'), { recursive: true });
    await mkdir(join(fixture, 'agents'), { recursive: true });

    await writeFile(
      join(fixture, '.claude-plugin', 'plugin.json'),
      JSON.stringify({
        name: 'hooks-agents-only',
        version: '1.0.0',
        description: 'Test fixture',
        author: { name: 'Test' },
        license: 'MIT',
      })
    );

    await writeFile(
      join(fixture, 'hooks', 'hooks.json'),
      JSON.stringify({ hooks: [{ name: 'test', events: ['onSave'], tool: 'lint' }] })
    );

    await writeFile(
      join(fixture, 'agents', 'helper.md'),
      '---\nname: helper\ndescription: test\n---\n# Helper'
    );

    try {
      const ir = await adapter.parse(fixture);
      expect(ir.components.hooks.length).toBe(1);
      expect(ir.components.agents.length).toBe(1);
      expect(ir.components.commands.length).toBe(0);
      expect(ir.compatibility.overall).toBe('full');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 7: Run full adapter test to verify all pass**

Run: `cd agent-plugin-marketplace && bun test tests/adapters/claude.test.ts`

Expected: ALL PASS

- [ ] **Step 8: Update generator test expectations**

In `tests/generator/vscode-plugin.test.ts`, the test `'normalizes Claude plugin naming but preserves source platform metadata'` doesn't assert `_compatibility.overall` for Claude, so no change needed. Verify:

Run: `cd agent-plugin-marketplace && bun test tests/generator/vscode-plugin.test.ts`

Expected: ALL PASS (the Claude generator test doesn't assert on overall compat level)

- [ ] **Step 9: Commit**

```bash
cd agent-plugin-marketplace
git add src/adapters/claude.ts tests/adapters/claude.test.ts
git commit -m "fix(claude): upgrade hooks and agents compatibility to full

VS Code natively reads .claude/settings.json hooks and .claude/agents/*.md
format. No format conversion is needed — these should be rated as full
compatibility, not partial.

Ref: upstream-compatibility-analysis.md"
```

---

### Task 2: 调查 Commands 组件并更新评级注释

**Files:**
- Modify: `src/adapters/claude.ts:349-355` (commands compat notes)
- Modify: `src/adapters/cursor.ts:487-493` (commands compat notes)
- Modify: `tests/adapters/claude.test.ts` (update command compat assertion)

**Context:** `parseCommands()` 在 Claude adapter 中扫描 `commands/` 目录下的 `.sh`, `.js`, `.ts` 文件。在 Cursor adapter 中通过 manifest 的 `commands` 字段解析。这些是平台特有的 shell/script 命令，VS Code 没有直接对应的命令执行概念（最接近的是 `.prompt.md`，但语义不同）。评级维持 `partial`，但注释需要精确化。

- [ ] **Step 1: Write the failing test for precise command compat notes**

In `tests/adapters/claude.test.ts`, add:

```typescript
  test('command compatibility notes describe platform-specific shell scripts', async () => {
    const ir = await adapter.parse(FIXTURE);
    const commandCompat = ir.compatibility.details.find(d => d.type === 'command');
    expect(commandCompat).toBeDefined();
    expect(commandCompat?.level).toBe('partial');
    expect(commandCompat?.notes).toContain('shell');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent-plugin-marketplace && bun test tests/adapters/claude.test.ts`

Expected: FAIL — notes don't contain `'shell'`

- [ ] **Step 3: Update command compat notes in Claude adapter**

In `src/adapters/claude.ts`, change the commands section in `computeCompatibility()`:

```typescript
    // Commands are platform-specific shell scripts with no direct VS Code equivalent
    for (const command of components.commands) {
      details.push({
        type: 'command',
        name: command.name,
        level: 'partial' as const,
        notes: 'Platform-specific shell scripts copied to output; no direct VS Code command equivalent',
      });
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent-plugin-marketplace && bun test tests/adapters/claude.test.ts`

Expected: ALL PASS

- [ ] **Step 5: Update Cursor adapter command notes similarly**

In `src/adapters/cursor.ts`, change the commands section in `computeCompatibility()`:

```typescript
    for (const command of components.commands) {
      details.push({
        type: 'command',
        name: command.name,
        level: 'partial' as const,
        notes: 'Platform-specific shell scripts copied to output; no direct VS Code command equivalent',
      });
    }
```

- [ ] **Step 6: Run Cursor adapter test**

Run: `cd agent-plugin-marketplace && bun test tests/adapters/cursor.test.ts`

Expected: ALL PASS (no existing test asserts on exact command notes text)

- [ ] **Step 7: Run full test suite**

Run: `cd agent-plugin-marketplace && bun test`

Expected: ALL PASS

- [ ] **Step 8: Commit**

```bash
cd agent-plugin-marketplace
git add src/adapters/claude.ts src/adapters/cursor.ts tests/adapters/claude.test.ts
git commit -m "fix(adapters): clarify command compatibility notes

Commands are platform-specific shell scripts (.sh/.js/.ts) with no direct
VS Code command equivalent. Updated notes to accurately describe the gap."
```

---

## Phase B: Codex 格式转换改进（可并行）

### Task 3: Codex Agent 格式转换 — YAML → agent.md

**Files:**
- Modify: `src/adapters/types.ts:107` (AgentRef format union type)
- Modify: `src/generator/vscode-plugin.ts:102-106` (copyAgents → add YAML conversion)
- Create: `tests/fixtures/codex-github/agents/reviewer.yaml` (verify existing fixture content)
- Modify: `tests/generator/vscode-plugin.test.ts` (add agent conversion test)
- Modify: `src/adapters/codex.ts:308-315` (update agent compat to reflect conversion)

**Context:** Codex agents 是 `.yaml`/`.yml` 文件，VS Code 期望 `.agent.md` 文件。当前 generator 用 `copyAgents()` 直接复制，没有做格式转换。需要实现 YAML → Markdown 转换，转换后评级可从 `partial` 调整为更精确的描述。

- [ ] **Step 1: Read the existing Codex agent fixture to understand format**

Run: `cat agent-plugin-marketplace/tests/fixtures/codex-github/agents/reviewer.yaml`

Note the YAML fields: `name`, `description`, `developer_instructions`, and any other fields present.

- [ ] **Step 2: Write the failing generator test for agent conversion**

In `tests/generator/vscode-plugin.test.ts`, add after the existing Codex test:

```typescript
  test('converts Codex YAML agents to .agent.md format', async () => {
    const ir = await new CodexAdapter().parse(join(FIXTURES_DIR, 'codex-github'));
    const outDir = join(OUTPUT_ROOT, 'codex-agent-convert');

    await ensureCleanDir(outDir);
    await new VsCodePluginGenerator().generate(ir, outDir);

    // Should have .md files in agents/, not .yaml
    const agentMd = await readFile(join(outDir, 'agents/reviewer.md'), 'utf-8');
    expect(agentMd).toContain('---');
    expect(agentMd).toContain('name:');
    expect(agentMd).toContain('description:');
  });
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd agent-plugin-marketplace && bun test tests/generator/vscode-plugin.test.ts`

Expected: FAIL — either file doesn't exist at `.md` path, or content is raw YAML not markdown

- [ ] **Step 4: Implement convertCodexAgent in VsCodePluginGenerator**

In `src/generator/vscode-plugin.ts`, add a new method and modify `copyAgents`:

```typescript
  private async copyAgents(ir: PluginIR, outDir: string) {
    for (const agent of ir.components.agents) {
      if (agent.format === 'codex-yaml') {
        await this.convertCodexAgentToMd(ir, agent, outDir);
      } else {
        await this.copyPath(join(ir.source.pluginPath, agent.path), join(outDir, agent.path));
      }
    }
  }

  private async convertCodexAgentToMd(ir: PluginIR, agent: AgentRef, outDir: string) {
    const sourcePath = join(ir.source.pluginPath, agent.path);
    const content = await readFile(sourcePath, 'utf-8');
    const parsed = this.parseSimpleYaml(content);

    const frontmatter: string[] = ['---'];
    if (parsed.name) {
      frontmatter.push(`name: ${parsed.name}`);
    }
    if (parsed.description) {
      frontmatter.push(`description: ${parsed.description}`);
    }
    frontmatter.push('---');

    const body = parsed.developer_instructions || parsed.description || '';
    const mdContent = `${frontmatter.join('\n')}\n\n${body}\n`;

    const mdName = agent.name + '.md';
    const outputPath = join(outDir, 'agents', mdName);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, mdContent, 'utf-8');
  }

  /** Minimal YAML key-value parser for flat Codex agent files. Does not handle nested structures. */
  private parseSimpleYaml(content: string): Record<string, string> {
    const result: Record<string, string> = {};
    let currentKey = '';
    let multilineValue = '';
    let inMultiline = false;

    for (const line of content.split('\n')) {
      if (inMultiline) {
        if (/^\S/.test(line) && line.includes(':')) {
          result[currentKey] = multilineValue.trim();
          inMultiline = false;
        } else {
          multilineValue += line + '\n';
          continue;
        }
      }

      const match = line.match(/^(\w[\w_]*)\s*:\s*(.*)/);
      if (match) {
        currentKey = match[1];
        const value = match[2].trim();
        if (value === '|' || value === '>') {
          inMultiline = true;
          multilineValue = '';
        } else {
          result[currentKey] = value.replace(/^["']|["']$/g, '');
        }
      }
    }

    if (inMultiline && currentKey) {
      result[currentKey] = multilineValue.trim();
    }

    return result;
  }
```

Add `AgentRef` to the imports at the top of the file:

```typescript
import type {
  AgentRef,
  Compatibility,
  ComponentCompat,
  DroppedComponent,
  HookRef,
  McpRef,
  PluginIR,
  RuleRef,
} from '../adapters/types';
```

- [ ] **Step 5: Update buildOfficialManifest to point agents at .md files**

The current `buildOfficialManifest` already uses `agents: './agents/'` which is correct — the directory will now contain `.md` files. No change needed here.

- [ ] **Step 6: Run the generator test to verify it passes**

Run: `cd agent-plugin-marketplace && bun test tests/generator/vscode-plugin.test.ts`

Expected: ALL PASS

- [ ] **Step 7: Update Codex adapter agent compat notes**

In `src/adapters/codex.ts`, update `computeCompatibility()` agents section:

```typescript
    // Agents need YAML → .agent.md format conversion (handled by generator)
    for (const agent of components.agents) {
      details.push({
        type: 'agent',
        name: agent.name,
        level: 'partial' as const,
        notes: 'Codex YAML agents converted to .agent.md; some fields (sandbox_mode, nickname_candidates) have no VS Code equivalent',
      });
    }
```

- [ ] **Step 8: Run full test suite**

Run: `cd agent-plugin-marketplace && bun test`

Expected: ALL PASS

- [ ] **Step 9: Commit**

```bash
cd agent-plugin-marketplace
git add src/generator/vscode-plugin.ts src/adapters/codex.ts tests/generator/vscode-plugin.test.ts
git commit -m "feat(generator): convert Codex YAML agents to .agent.md format

Implements YAML-to-markdown conversion for Codex agent definitions.
Maps name, description to frontmatter and developer_instructions to body.
Fields without VS Code equivalents (sandbox_mode, nickname_candidates)
are noted in compatibility metadata."
```

---

### Task 4: Codex Hooks 格式转换注释改进

**Files:**
- Modify: `src/adapters/codex.ts:300-308` (hooks compat notes)
- Modify: `tests/adapters/codex.test.ts` (add precise hooks compat test)

**Context:** Codex hooks（`.codex/hooks.json`）格式与 Claude hooks 类似（同样是 JSON，同样有 `hooks[]` 数组），但 Codex 仅支持 5 个事件且仅拦截 Bash 工具。VS Code 不原生读取 `.codex/` 目录。当前 generator 已经将 hooks 文件复制到 `hooks/hooks.json` 并修正路径。评级维持 `partial`，但注释应更精确。

- [ ] **Step 1: Write the failing test for precise hooks compat notes**

In `tests/adapters/codex.test.ts`, add:

```typescript
  test('hooks compatibility notes describe format conversion and limited event set', async () => {
    const ir = await adapter.parse(FIXTURE);
    const hookCompat = ir.compatibility.details.find(d => d.type === 'hook');
    expect(hookCompat).toBeDefined();
    expect(hookCompat?.level).toBe('partial');
    expect(hookCompat?.notes).toContain('format conversion');
    expect(hookCompat?.notes).toContain('5 events');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd agent-plugin-marketplace && bun test tests/adapters/codex.test.ts`

Expected: FAIL — notes don't contain `'5 events'`

- [ ] **Step 3: Update Codex hooks compat notes**

In `src/adapters/codex.ts`, change the hooks section in `computeCompatibility()`:

```typescript
    // Hooks need format conversion; Codex supports only 5 events and Bash-only tool interception
    for (const hook of components.hooks) {
      details.push({
        type: 'hook',
        name: hook.configPath,
        level: 'partial' as const,
        notes: 'Codex hooks require format conversion; limited to 5 events with Bash-only tool interception',
      });
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd agent-plugin-marketplace && bun test tests/adapters/codex.test.ts`

Expected: ALL PASS

- [ ] **Step 5: Run full test suite**

Run: `cd agent-plugin-marketplace && bun test`

Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
cd agent-plugin-marketplace
git add src/adapters/codex.ts tests/adapters/codex.test.ts
git commit -m "fix(codex): improve hooks compatibility notes precision

Notes now accurately describe Codex hooks limitations: format conversion
required, only 5 lifecycle events, Bash-only tool interception."
```

---

## Phase C: Cursor Rules 转换精度

### Task 5: Cursor Rules 转换 — 改进 Apply Intelligently 模式处理

**Files:**
- Modify: `src/generator/vscode-plugin.ts:183-210` (convertRuleToInstruction)
- Modify: `src/adapters/cursor.ts:485-493` (rules compat notes)
- Modify: `tests/generator/vscode-plugin.test.ts` (add intelligent-mode conversion test)
- Create: `tests/fixtures/cursor-continual-learning/rules/intelligent-rule.mdc` (test fixture)

**Context:** Cursor 有四种规则应用模式。当前转换逻辑：
- `alwaysApply: true` → `applyTo: always` ✅ 无损
- `alwaysApply: false` + `globs: [*.ts]` → `applyTo: **/*.ts` ✅ 无损
- `alwaysApply: false` + 无 `globs`（Apply Intelligently）→ 无 `applyTo` ⚠️ 有损失

对于 Apply Intelligently 模式，应转换为 `applyTo: "**"` 并添加注释说明原始语义。

- [ ] **Step 1: Create the "Apply Intelligently" test fixture**

Create `tests/fixtures/cursor-continual-learning/rules/intelligent-rule.mdc`:

```
---
description: Apply this rule intelligently based on context
alwaysApply: false
---

# Intelligent Context Rule

Apply best practices based on the current editing context.
```

Note: this fixture has `alwaysApply: false` and NO `globs` — this is the "Apply Intelligently" mode.

- [ ] **Step 2: Update the fixture's plugin.json to include the new rule**

Read the current `tests/fixtures/cursor-continual-learning/.cursor-plugin/plugin.json` and confirm the `rules` field already includes the `rules/` directory. If it points to a specific directory, the new `.mdc` file will be auto-discovered.

Run: `cat agent-plugin-marketplace/tests/fixtures/cursor-continual-learning/.cursor-plugin/plugin.json`

If the `rules` field is `"./rules/"` or similar, the new file is already covered. If not, add it.

- [ ] **Step 3: Write the failing test for intelligent-mode conversion**

In `tests/generator/vscode-plugin.test.ts`, add after the existing Cursor test:

```typescript
  test('converts Apply Intelligently rules with applyTo "**" and origin comment', async () => {
    const ir = await new CursorAdapter().parse(join(FIXTURES_DIR, 'cursor-continual-learning'));
    const outDir = join(OUTPUT_ROOT, 'cursor-intelligent');

    await ensureCleanDir(outDir);
    await new VsCodePluginGenerator().generate(ir, outDir);

    const intelligentInstruction = await readFile(
      join(outDir, 'instructions/intelligent-rule.instructions.md'),
      'utf-8'
    );
    expect(intelligentInstruction).toContain('applyTo: "**"');
    expect(intelligentInstruction).toContain('Apply Intelligently');
  });
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd agent-plugin-marketplace && bun test tests/generator/vscode-plugin.test.ts`

Expected: FAIL — either no `applyTo` or wrong value

- [ ] **Step 5: Update convertRuleToInstruction to handle Apply Intelligently mode**

In `src/generator/vscode-plugin.ts`, modify `convertRuleToInstruction`:

```typescript
  private convertRuleToInstruction(rule: RuleRef, content: string) {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?/);
    const body = frontmatterMatch ? content.slice(frontmatterMatch[0].length).trimStart() : content;
    const descriptionMatch = frontmatterMatch?.[1].match(/^description:\s*(.+)$/m);
    const description = descriptionMatch?.[1]?.trim();

    let applyTo: string;
    let originComment: string;

    if (rule.alwaysApply) {
      applyTo = 'always';
      originComment = '<!-- Converted from Cursor .mdc rule (Always Apply) -->';
    } else if (rule.globs && rule.globs.length > 0) {
      applyTo = rule.globs.join(', ');
      originComment = '<!-- Converted from Cursor .mdc rule (Apply to Specific Files) -->';
    } else {
      applyTo = '"**"';
      originComment = '<!-- Converted from Cursor .mdc rule (Apply Intelligently — original mode uses AI-based context matching, mapped to broad apply) -->';
    }

    const header = [
      '---',
      'source: cursor-rule',
      description ? `description: ${description}` : undefined,
      `applyTo: ${applyTo}`,
      '---',
      '',
      originComment,
      '',
    ]
      .filter(Boolean)
      .join('\n');

    return `${header}${body.endsWith('\n') ? body : `${body}\n`}`;
  }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd agent-plugin-marketplace && bun test tests/generator/vscode-plugin.test.ts`

Expected: ALL PASS

- [ ] **Step 7: Verify existing Cursor rule tests still pass**

The existing test asserts `alwaysInstruction` contains `'applyTo: always'` and `tsInstruction` contains `'applyTo: **/*.ts, **/*.tsx'`. Both should still pass since those paths are unchanged.

Run: `cd agent-plugin-marketplace && bun test tests/generator/vscode-plugin.test.ts`

Expected: ALL PASS

- [ ] **Step 8: Update Cursor adapter rules compat notes**

In `src/adapters/cursor.ts`, update the rules section in `computeCompatibility()`:

```typescript
    for (const rule of components.rules) {
      details.push({
        type: 'rule',
        name: rule.path,
        level: 'partial' as const,
        notes: 'Cursor .mdc rules converted to .instructions.md; Apply Intelligently mode mapped to broad apply ("**")',
      });
    }

    if (components.rules.length > 0) {
      warnings.push('Cursor .mdc rules converted to .instructions.md; Apply Intelligently and Apply Manually modes lose original semantics');
    }
```

- [ ] **Step 9: Run full test suite**

Run: `cd agent-plugin-marketplace && bun test`

Expected: ALL PASS

- [ ] **Step 10: Commit**

```bash
cd agent-plugin-marketplace
git add src/generator/vscode-plugin.ts src/adapters/cursor.ts tests/generator/vscode-plugin.test.ts tests/fixtures/cursor-continual-learning/rules/intelligent-rule.mdc
git commit -m "feat(cursor): improve Apply Intelligently rule conversion

Rules with alwaysApply=false and no globs (Apply Intelligently mode) are
now converted to applyTo: '**' with an origin comment explaining the
semantic difference. Previously these produced no applyTo at all."
```

---

## Phase D: 最终验证

### Task 6: 全量回归测试 + 已生成插件验证

**Files:** None (read-only verification)

- [ ] **Step 1: Run full test suite**

Run: `cd agent-plugin-marketplace && bun test`

Expected: ALL PASS, no regressions

- [ ] **Step 2: Type check**

Run: `cd agent-plugin-marketplace && bunx tsc --noEmit`

Expected: No type errors

- [ ] **Step 3: Verify a real Claude plugin with hooks/agents gets full compatibility**

Run the sync pipeline on a Claude plugin fixture and check the generated `_meta.json`:

```bash
cd agent-plugin-marketplace
# Just parse and check — don't need full sync
bun -e "
import { ClaudeAdapter } from './src/adapters/claude';
const ir = await new ClaudeAdapter().parse('tests/fixtures/claude-code-review');
console.log('Overall:', ir.compatibility.overall);
console.log('Details:', JSON.stringify(ir.compatibility.details.map(d => ({ type: d.type, level: d.level })), null, 2));
"
```

Expected output should show hooks=full, agents=full, commands=partial → overall=partial (because of commands).

- [ ] **Step 4: Commit final state (if any straggler fixes)**

```bash
cd agent-plugin-marketplace
git status
# If clean, skip. Otherwise:
git add -A && git commit -m "chore: post-verification cleanup"
```

---

## Current State
Status: closed
Archive Eligible: no
Close Reason: merged into local dev, pushed to origin/dev, and opened PR #7 from dev to main

## Execution Summary

| Phase | Tasks | 并行策略 | 核心改动 |
|-------|-------|---------|---------|
| A | Task 1 + Task 2 | **可并行** | Claude hooks/agents → full; Commands notes 精确化 |
| B | Task 3 + Task 4 | **可并行** | Codex YAML→MD agent 转换; hooks notes 精确化 |
| C | Task 5 | 串行 | Cursor Apply Intelligently 模式处理 |
| D | Task 6 | 串行 | 全量回归验证 |

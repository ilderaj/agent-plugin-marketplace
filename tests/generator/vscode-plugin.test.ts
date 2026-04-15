import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, stat } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { CodexAdapter } from '../../src/adapters/codex';
import { ClaudeAdapter } from '../../src/adapters/claude';
import { CursorAdapter } from '../../src/adapters/cursor';
import { VsCodePluginGenerator } from '../../src/generator/vscode-plugin';
import type { PluginIR } from '../../src/adapters/types';

const FIXTURES_DIR = join(import.meta.dir, '../fixtures');
const OUTPUT_ROOT = join(import.meta.dir, '../.generated/vscode-plugin');

async function ensureCleanDir(path: string) {
  await rm(path, { recursive: true, force: true });
  await mkdir(path, { recursive: true });
}

async function readJson(path: string) {
  return JSON.parse(await readFile(path, 'utf-8'));
}

afterEach(async () => {
  await rm(OUTPUT_ROOT, { recursive: true, force: true });
});

describe('VsCodePluginGenerator', () => {
  test('generates Codex plugin structure and documents dropped app support', async () => {
    const ir = await new CodexAdapter().parse(join(FIXTURES_DIR, 'codex-github'));
    const outDir = join(OUTPUT_ROOT, 'codex');

    await ensureCleanDir(outDir);

    await new VsCodePluginGenerator().generate(ir, outDir);

    const manifest = await readJson(join(outDir, 'plugin.json'));
    expect(manifest.name).toBe('codex--github');
    expect(manifest.displayName).toBe('GitHub (from Codex)');
    expect(manifest.skills).toBe('./skills/');
    expect(manifest.agents).toBe('./agents/');
    expect(manifest.hooks).toBe('./hooks/hooks.json');
    expect(manifest._source.platform).toBe('codex');
    expect(manifest._compatibility.overall).toBe('partial');
    expect(manifest._compatibility.droppedComponents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'app',
        }),
      ])
    );

    await expect(stat(join(outDir, 'skills/github/SKILL.md'))).resolves.toBeDefined();
    const generatedHooks = await readJson(join(outDir, 'hooks/hooks.json'));
    expect(generatedHooks.hooks[0].events).toContain('onPullRequest');
    expect(await readFile(join(outDir, 'README.md'), 'utf-8')).toContain('.app.json');
  });

  test('normalizes Claude plugin naming but preserves source platform metadata', async () => {
    const ir = await new ClaudeAdapter().parse(join(FIXTURES_DIR, 'claude-code-review'));
    const outDir = join(OUTPUT_ROOT, 'claude');

    await ensureCleanDir(outDir);

    await new VsCodePluginGenerator().generate(ir, outDir);

    const manifest = await readJson(join(outDir, 'plugin.json'));
    expect(manifest.name).toBe('claude--code-review');
    expect(manifest.displayName).toBe('Code Review (from Claude Code)');
    expect(manifest._source.platform).toBe('claude-code');
    expect(manifest.hooks).toBe('./hooks/hooks.json');
    expect(manifest.mcpServers).toBe('./.mcp.json');
    expect(await readFile(join(outDir, 'README.md'), 'utf-8')).toContain('claude-code');
  });

  test('converts Cursor rules into VS Code instructions and renames MCP config', async () => {
    const ir = await new CursorAdapter().parse(join(FIXTURES_DIR, 'cursor-continual-learning'));
    const outDir = join(OUTPUT_ROOT, 'cursor');

    await ensureCleanDir(outDir);

    await new VsCodePluginGenerator().generate(ir, outDir);

    const manifest = await readJson(join(outDir, 'plugin.json'));
    expect(manifest.name).toBe('cursor--continual-learning');
    expect(manifest.hooks).toBe('./hooks/hooks.json');
    expect(manifest.mcpServers).toBe('./.mcp.json');
    expect(manifest.instructions).toBe('./instructions/');
    expect(manifest._compatibility.droppedComponents.some((component: { type: string }) => component.type === 'command')).toBe(false);
    expect(manifest._compatibility.notes.join('\n')).toContain('.instructions.md');
    expect(manifest._compatibility.notes.join('\n')).toContain('manual verification');

    const alwaysInstruction = await readFile(
      join(outDir, 'instructions/learning-context.instructions.md'),
      'utf-8'
    );
    expect(alwaysInstruction).toContain('applyTo: always');
    expect(alwaysInstruction).toContain('description: Keep learning context active across sessions');
    expect(alwaysInstruction).toContain('# Learning Context Rules');

    const tsInstruction = await readFile(
      join(outDir, 'instructions/typescript-rules.instructions.md'),
      'utf-8'
    );
    expect(tsInstruction).toContain('applyTo: **/*.ts, **/*.tsx');
    expect(tsInstruction).toContain('# TypeScript Learning Rules');

    const mcpConfig = await readJson(join(outDir, '.mcp.json'));
    expect(mcpConfig.mcpServers['learning-server']).toBeDefined();
    await expect(stat(join(outDir, 'commands/analyze.sh'))).resolves.toBeDefined();

    const readme = await readFile(join(outDir, 'README.md'), 'utf-8');
    expect(readme).toContain('converted to VS Code `.instructions.md` files');
    expect(readme).toContain('manual verification');
    expect(readme).toContain('Compatibility Summary');
  });

  test('preserves worse compatibility levels when generator also has dropped components', async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), 'generator-source-'));
    const outDir = join(OUTPUT_ROOT, 'degraded');

    try {
      await ensureCleanDir(outDir);

      const ir: PluginIR = {
        id: 'codex--degraded',
        source: {
          platform: 'codex',
          repoUrl: 'https://example.com/upstream',
          pluginPath: sourceRoot,
          commitSha: 'abc123',
          version: '1.0.0',
        },
        manifest: {
          name: 'degraded',
          version: '1.0.0',
          description: 'Degraded fixture',
          author: { name: 'Test' },
          raw: {},
        },
        components: {
          skills: [],
          hooks: [],
          agents: [],
          commands: [],
          mcpServers: [],
          rules: [],
          apps: [],
        },
        compatibility: {
          overall: 'degraded',
          details: [],
          warnings: [],
          droppedComponents: [
            {
              type: 'app',
              reason: 'App connectors are unsupported',
            },
          ],
        },
      };

      await new VsCodePluginGenerator().generate(ir, outDir);

      const manifest = await readJson(join(outDir, 'plugin.json'));
      expect(manifest._compatibility.overall).toBe('degraded');
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
    }
  });
});

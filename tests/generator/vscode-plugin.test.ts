import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'fs/promises';
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

    // plugin.json: official fields only, no displayName/_source/_compatibility
    const manifest = await readJson(join(outDir, 'plugin.json'));
    expect(manifest.name).toBe('codex--github');
    expect(manifest.strict).toBe(false);
    expect(manifest.skills).toBe('./skills/');
    expect(manifest.agents).toBe('./agents/');
    expect(manifest.hooks).toBe('./hooks/hooks.json');
    expect(manifest.tags).toEqual(['github', 'vcs', 'code-review']);
    expect(manifest.displayName).toBeUndefined();
    expect(manifest._source).toBeUndefined();
    expect(manifest._compatibility).toBeUndefined();
    expect(manifest.instructions).toBeUndefined();

    // _meta.json: displayName/_source/_compatibility
    const meta = await readJson(join(outDir, '_meta.json'));
    expect(meta.displayName).toBe('GitHub (from Codex)');
    expect(meta._source.platform).toBe('codex');
    expect(meta._compatibility.overall).toBe('partial');
    expect(meta._compatibility.droppedComponents).toEqual(
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

    // plugin.json: official manifest only
    const manifest = await readJson(join(outDir, 'plugin.json'));
    expect(manifest.name).toBe('claude--code-review');
    expect(manifest.strict).toBe(false);
    expect(manifest.hooks).toBe('./hooks/hooks.json');
    expect(manifest.mcpServers).toBe('./.mcp.json');
    expect(manifest.displayName).toBeUndefined();
    expect(manifest._source).toBeUndefined();
    expect(manifest._compatibility).toBeUndefined();

    // _meta.json: sidecar with platform info
    const meta = await readJson(join(outDir, '_meta.json'));
    expect(meta.displayName).toBe('Code Review (from Claude Code)');
    expect(meta._source.platform).toBe('claude-code');

    expect(await readFile(join(outDir, 'README.md'), 'utf-8')).toContain('claude-code');
  });

  test('converts Cursor rules into VS Code instructions and renames MCP config', async () => {
    const ir = await new CursorAdapter().parse(join(FIXTURES_DIR, 'cursor-continual-learning'));
    const outDir = join(OUTPUT_ROOT, 'cursor');

    await ensureCleanDir(outDir);

    await new VsCodePluginGenerator().generate(ir, outDir);

    // plugin.json: official manifest, no instructions field, no _source/_compatibility
    const manifest = await readJson(join(outDir, 'plugin.json'));
    expect(manifest.name).toBe('cursor--continual-learning');
    expect(manifest.strict).toBe(false);
    expect(manifest.hooks).toBe('./hooks/hooks.json');
    expect(manifest.mcpServers).toBe('./.mcp.json');
    expect(manifest.instructions).toBeUndefined();
    expect(manifest._source).toBeUndefined();
    expect(manifest._compatibility).toBeUndefined();

    // _meta.json: compatibility info lives here
    const meta = await readJson(join(outDir, '_meta.json'));
    expect(meta._compatibility.droppedComponents.some((component: { type: string }) => component.type === 'command')).toBe(false);
    expect(meta._compatibility.notes.join('\n')).toContain('.instructions.md');
    expect(meta._compatibility.notes.join('\n')).toContain('manual verification');

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

      // _compatibility lives in _meta.json now
      const meta = await readJson(join(outDir, '_meta.json'));
      expect(meta._compatibility.overall).toBe('degraded');

      // plugin.json must have strict: false and no _compatibility
      const manifest = await readJson(join(outDir, 'plugin.json'));
      expect(manifest.strict).toBe(false);
      expect(manifest._compatibility).toBeUndefined();
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
    }
  });

  test('plugin.json and _meta.json are proper split of official and meta fields', async () => {
    const ir = await new CodexAdapter().parse(join(FIXTURES_DIR, 'codex-github'));
    const outDir = join(OUTPUT_ROOT, 'split-check');

    await ensureCleanDir(outDir);
    await new VsCodePluginGenerator().generate(ir, outDir);

    const manifest = await readJson(join(outDir, 'plugin.json'));
    const meta = await readJson(join(outDir, '_meta.json'));

    // Official manifest must not contain private fields
    const forbiddenInManifest = ['displayName', '_source', '_compatibility', 'instructions'];
    for (const field of forbiddenInManifest) {
      expect(manifest).not.toHaveProperty(field);
    }

    // Official manifest must have strict: false
    expect(manifest.strict).toBe(false);

    // Meta sidecar must contain all private fields
    expect(meta).toHaveProperty('displayName');
    expect(meta).toHaveProperty('_source');
    expect(meta).toHaveProperty('_compatibility');
    expect(meta._source).toHaveProperty('platform');
    expect(meta._source).toHaveProperty('upstream');
    expect(meta._source).toHaveProperty('pluginPath');
    expect(meta._source).toHaveProperty('commitSha');
    expect(meta._source).toHaveProperty('version');
  });

  test('tags round-trip: adapter parses tags, plugin.json and marketplace entry both carry them', async () => {
    const ir = await new CodexAdapter().parse(join(FIXTURES_DIR, 'codex-github'));
    const outDir = join(OUTPUT_ROOT, 'tags-roundtrip');

    await ensureCleanDir(outDir);
    await new VsCodePluginGenerator().generate(ir, outDir);

    // IR must carry tags from the fixture manifest
    expect(ir.manifest.tags).toEqual(['github', 'vcs', 'code-review']);

    // plugin.json must include tags
    const manifest = await readJson(join(outDir, 'plugin.json'));
    expect(manifest.tags).toEqual(['github', 'vcs', 'code-review']);
  });

  test('missing upstream version: plugin.json gets version "0.0.0" as fallback', async () => {
    const ir = await new CodexAdapter().parse(join(FIXTURES_DIR, 'codex-no-version'));
    const outDir = join(OUTPUT_ROOT, 'no-version');

    await ensureCleanDir(outDir);
    await new VsCodePluginGenerator().generate(ir, outDir);

    const manifest = await readJson(join(outDir, 'plugin.json'));
    expect(manifest.version).toBe('0.0.0');
  });

  test('_meta.json pluginPath is a relative/logical path, not an absolute host path', async () => {
    const outDir = join(OUTPUT_ROOT, 'meta-relpath');
    await ensureCleanDir(outDir);

    const ir: PluginIR = {
      id: 'codex--relpath-test',
      source: {
        platform: 'codex',
        repoUrl: 'https://example.com/upstream',
        pluginPath: '/absolute/host/path/to/cache/codex/plugins/relpath-test',
        pluginRelPath: 'plugins/relpath-test',
        commitSha: 'abc123',
        version: '1.0.0',
      },
      manifest: {
        name: 'relpath-test',
        version: '1.0.0',
        description: 'Relative path test fixture',
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
        overall: 'full',
        details: [],
        warnings: [],
        droppedComponents: [],
      },
    };

    await new VsCodePluginGenerator().generate(ir, outDir);

    const meta = await readJson(join(outDir, '_meta.json'));
    // pluginPath must not be an absolute path (no leading slash)
    expect(meta._source.pluginPath).not.toMatch(/^\//);
    // must still be traceable (contains the plugin dir name)
    expect(meta._source.pluginPath).toContain('relpath-test');
  });

  test('converts Codex YAML agents to markdown files with frontmatter', async () => {
    const ir = await new CodexAdapter().parse(join(FIXTURES_DIR, 'codex-github'));
    const outDir = join(OUTPUT_ROOT, 'codex-agent-conversion');

    await ensureCleanDir(outDir);
    await new VsCodePluginGenerator().generate(ir, outDir);

    // Agent output must be a markdown file, not the raw YAML
    const reviewerMd = await readFile(join(outDir, 'agents/reviewer.md'), 'utf-8');

    // Must have YAML frontmatter with name and description
    expect(reviewerMd).toContain('---');
    expect(reviewerMd).toContain('name: reviewer');
    expect(reviewerMd).toContain('description: Code review agent');

    // Must include developer_instructions in the markdown body
    expect(reviewerMd).toContain('You are an expert code reviewer.');
    expect(reviewerMd).toContain('Focus on correctness, security, and maintainability.');

    // Raw YAML file must not exist in output
    await expect(stat(join(outDir, 'agents/reviewer.yaml'))).rejects.toThrow();

    // tester.yml should also be converted to markdown
    const testerMd = await readFile(join(outDir, 'agents/tester.md'), 'utf-8');
    expect(testerMd).toContain('name: tester');
    expect(testerMd).toContain('description: Test automation agent');
    await expect(stat(join(outDir, 'agents/tester.yml'))).rejects.toThrow();
  });

  test('agent YAML with path-traversal name does not escape the agents output directory', async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), 'agent-escape-'));
    const outDir = join(OUTPUT_ROOT, 'agent-path-escape');

    try {
      await ensureCleanDir(outDir);
      await mkdir(join(sourceRoot, 'agents'), { recursive: true });

      await writeFile(
        join(sourceRoot, 'agents', 'malicious.yaml'),
        [
          'name: ../../escape',
          'description: Path traversal attempt',
          'developer_instructions: |',
          '  Should not escape.',
        ].join('\n'),
        'utf-8'
      );

      const ir: PluginIR = {
        id: 'codex--escape-test',
        source: {
          platform: 'codex',
          repoUrl: 'https://example.com',
          pluginPath: sourceRoot,
          commitSha: 'abc123',
          version: '1.0.0',
        },
        manifest: {
          name: 'escape-test',
          version: '1.0.0',
          description: 'Test',
          author: { name: 'Test' },
          raw: {},
        },
        components: {
          skills: [],
          hooks: [],
          agents: [{ name: 'malicious', path: 'agents/malicious.yaml', format: 'codex-yaml' }],
          commands: [],
          mcpServers: [],
          rules: [],
          apps: [],
        },
        compatibility: {
          overall: 'partial',
          details: [],
          warnings: [],
          droppedComponents: [],
        },
      };

      await new VsCodePluginGenerator().generate(ir, outDir);

      // Output must be confined to agents/ inside outDir
      const agentsDir = join(outDir, 'agents');
      const files = await readdir(agentsDir);
      expect(files).toHaveLength(1);
      // Filename must be sanitized — no path segments
      expect(files[0]).not.toContain('/');
      expect(files[0]).not.toContain('..');
      expect(files[0]).toMatch(/\.md$/);

      // The parsed name must still appear in frontmatter
      const content = await readFile(join(agentsDir, files[0]), 'utf-8');
      expect(content).toContain('name: ../../escape');

      // Must NOT have created a file outside outDir
      await expect(stat(join(outDir, 'escape.md'))).rejects.toThrow();
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
    }
  });

  test('developer_instructions using folded scalar (>) still appears in generated markdown body', async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), 'folded-scalar-'));
    const outDir = join(OUTPUT_ROOT, 'folded-scalar');

    try {
      await ensureCleanDir(outDir);
      await mkdir(join(sourceRoot, 'agents'), { recursive: true });

      await writeFile(
        join(sourceRoot, 'agents', 'folded.yaml'),
        [
          'name: folded-agent',
          'description: Folded scalar test',
          'developer_instructions: >',
          '  This is a folded',
          '  block scalar.',
          '  It joins lines with spaces.',
        ].join('\n'),
        'utf-8'
      );

      const ir: PluginIR = {
        id: 'codex--folded-test',
        source: {
          platform: 'codex',
          repoUrl: 'https://example.com',
          pluginPath: sourceRoot,
          commitSha: 'abc123',
          version: '1.0.0',
        },
        manifest: {
          name: 'folded-test',
          version: '1.0.0',
          description: 'Folded scalar test',
          author: { name: 'Test' },
          raw: {},
        },
        components: {
          skills: [],
          hooks: [],
          agents: [{ name: 'folded', path: 'agents/folded.yaml', format: 'codex-yaml' }],
          commands: [],
          mcpServers: [],
          rules: [],
          apps: [],
        },
        compatibility: {
          overall: 'full',
          details: [],
          warnings: [],
          droppedComponents: [],
        },
      };

      await new VsCodePluginGenerator().generate(ir, outDir);

      const content = await readFile(join(outDir, 'agents/folded-agent.md'), 'utf-8');
      // Frontmatter must be present
      expect(content).toContain('name: folded-agent');
      expect(content).toContain('description: Folded scalar test');
      // developer_instructions content must appear in the markdown body
      expect(content).toContain('This is a folded');
      expect(content).toContain('block scalar');
      expect(content).toContain('joins lines with spaces');
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
    }
  });

  test('block scalar with non-2-space indentation is correctly de-indented', async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), 'indent-test-'));
    const outDir = join(OUTPUT_ROOT, 'indent-test');

    try {
      await ensureCleanDir(outDir);
      await mkdir(join(sourceRoot, 'agents'), { recursive: true });

      await writeFile(
        join(sourceRoot, 'agents', 'indented.yaml'),
        [
          'name: indent-agent',
          'description: Indentation test',
          'developer_instructions: |',
          '    Four space indented.',
          '    Second line here.',
        ].join('\n'),
        'utf-8'
      );

      const ir: PluginIR = {
        id: 'codex--indent-test',
        source: {
          platform: 'codex',
          repoUrl: 'https://example.com',
          pluginPath: sourceRoot,
          commitSha: 'abc123',
          version: '1.0.0',
        },
        manifest: {
          name: 'indent-test',
          version: '1.0.0',
          description: 'Indentation test',
          author: { name: 'Test' },
          raw: {},
        },
        components: {
          skills: [],
          hooks: [],
          agents: [{ name: 'indented', path: 'agents/indented.yaml', format: 'codex-yaml' }],
          commands: [],
          mcpServers: [],
          rules: [],
          apps: [],
        },
        compatibility: {
          overall: 'full',
          details: [],
          warnings: [],
          droppedComponents: [],
        },
      };

      await new VsCodePluginGenerator().generate(ir, outDir);

      const content = await readFile(join(outDir, 'agents/indent-agent.md'), 'utf-8');
      // Content must appear without extra leading spaces
      expect(content).toContain('Four space indented.');
      expect(content).toContain('Second line here.');
      // Must not have any residual leading spaces (4-space indent fully stripped)
      expect(content).not.toMatch(/^ +Four space/m);
      expect(content).not.toMatch(/^ +Second line/m);
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
    }
  });
});

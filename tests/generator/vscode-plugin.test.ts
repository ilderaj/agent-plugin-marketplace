import { afterEach, describe, expect, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'fs/promises';
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

function expectNormalizedText(content: string) {
  expect(content).not.toContain('\r');
  expect(content.endsWith('\n')).toBe(true);
  expect(content).not.toMatch(/\n\n$/);

  for (const line of content.split('\n').slice(0, -1)) {
    expect(line).not.toMatch(/[ \t]+$/);
  }
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

  test('cleanup for one plugin does not touch sibling output directories', async () => {
    const ir = await new CodexAdapter().parse(join(FIXTURES_DIR, 'codex-github'));
    const outDirA = join(OUTPUT_ROOT, 'codex-sibling-a');
    const outDirB = join(OUTPUT_ROOT, 'codex-sibling-b');
    const sentinel = 'keep me';

    await ensureCleanDir(outDirA);
    await ensureCleanDir(outDirB);
    await writeFile(join(outDirB, 'sentinel.txt'), sentinel);

    await new VsCodePluginGenerator().generate(ir, outDirA);

    expect(await readFile(join(outDirB, 'sentinel.txt'), 'utf-8')).toBe(sentinel);
    await expect(stat(join(outDirB, 'sentinel.txt'))).resolves.toBeDefined();
  });

  test('filters skill-private agents while preserving public skill assets', async () => {
    const ir = await new CodexAdapter().parse(join(FIXTURES_DIR, 'codex-github'));
    const outDir = join(OUTPUT_ROOT, 'codex-skill-private-filter');

    await ensureCleanDir(outDir);
    await new VsCodePluginGenerator().generate(ir, outDir);

    await expect(stat(join(outDir, 'skills/github/SKILL.md'))).resolves.toBeDefined();
    await expect(stat(join(outDir, 'skills/github/assets/github.svg'))).resolves.toBeDefined();
    await expect(stat(join(outDir, 'skills/github/references/reference.md'))).resolves.toBeDefined();
    await expect(stat(join(outDir, 'skills/github/scripts/setup.sh'))).resolves.toBeDefined();
    await expect(stat(join(outDir, 'skills/github/agents/openai.yaml'))).rejects.toThrow();
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

  test('emits commands manifest path for Claude fixtures', async () => {
    const ir = await new ClaudeAdapter().parse(join(FIXTURES_DIR, 'claude-code-review'));
    const outDir = join(OUTPUT_ROOT, 'claude-commands-manifest');

    await ensureCleanDir(outDir);
    await new VsCodePluginGenerator().generate(ir, outDir);

    const manifest = await readJson(join(outDir, 'plugin.json'));
    expect(manifest.commands).toBe('./commands/');
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

  test('emits commands manifest path for Cursor fixtures', async () => {
    const ir = await new CursorAdapter().parse(join(FIXTURES_DIR, 'cursor-continual-learning'));
    const outDir = join(OUTPUT_ROOT, 'cursor-commands-manifest');

    await ensureCleanDir(outDir);
    await new VsCodePluginGenerator().generate(ir, outDir);

    const manifest = await readJson(join(outDir, 'plugin.json'));
    expect(manifest.commands).toBe('./commands/');
  });

  test('converts ambiguous Cursor rule (alwaysApply: false, no globs) to applyTo: ** with origin comment', async () => {
    const ir = await new CursorAdapter().parse(join(FIXTURES_DIR, 'cursor-continual-learning'));
    const outDir = join(OUTPUT_ROOT, 'cursor-intelligent');

    await ensureCleanDir(outDir);

    await new VsCodePluginGenerator().generate(ir, outDir);

    const instruction = await readFile(
      join(outDir, 'instructions/intelligent-rule.instructions.md'),
      'utf-8'
    );

    // Ambiguous (alwaysApply: false, no globs) must map to applyTo: **
    expect(instruction).toContain('applyTo: "**"');

    // Must include origin comment explaining the ambiguity and semantic mapping
    expect(instruction).toContain('Origin: Cursor ambiguous mode (alwaysApply: false, no globs)');

    // Must preserve the body
    expect(instruction).toContain('# Intelligent Rule');
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

  test('normalizes text files inside copied skill directories while preserving binary files', async () => {
    const sourceRoot = join(OUTPUT_ROOT, 'source-normalized-tree');
    const outDir = join(OUTPUT_ROOT, 'normalized-tree');
    const binaryFixture = new Uint8Array([0x00, 0xff, 0x7f, 0x0d, 0x0a, 0x42]);

    try {
      await ensureCleanDir(sourceRoot);
      await ensureCleanDir(outDir);
      await mkdir(join(sourceRoot, 'skills', 'cleanup'), { recursive: true });

      await writeFile(
        join(sourceRoot, 'skills', 'cleanup', 'SKILL.md'),
        '# Cleanup skill  \r\nLine with spaces\t \r\n \r\n\r\n',
        'utf-8'
      );
      await writeFile(
        join(sourceRoot, 'skills', 'cleanup', 'LICENSE'),
        'License line  \r\nSecond line\t \r\n\t \r\n\r\n',
        'utf-8'
      );
      await writeFile(join(sourceRoot, 'skills', 'cleanup', 'icon.bin'), binaryFixture);

      const ir: PluginIR = {
        id: 'codex--normalized-text',
        source: {
          platform: 'codex',
          repoUrl: 'https://example.com/upstream',
          pluginPath: sourceRoot,
          commitSha: 'abc123',
          version: '1.0.0',
        },
        manifest: {
          name: 'normalized-text',
          version: '1.0.0',
          description: 'Normalized text fixture',
          author: { name: 'Test' },
          raw: {},
        },
        components: {
          skills: [{ name: 'cleanup', path: 'skills/cleanup' }],
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

      const copiedSkill = await readFile(join(outDir, 'skills', 'cleanup', 'SKILL.md'), 'utf-8');
      expectNormalizedText(copiedSkill);
      expect(copiedSkill).toBe('# Cleanup skill\nLine with spaces\n');

      const copiedLicense = await readFile(join(outDir, 'skills', 'cleanup', 'LICENSE'), 'utf-8');
      expectNormalizedText(copiedLicense);
      expect(copiedLicense).toBe('License line\nSecond line\n');

      const copiedBinary = await readFile(join(outDir, 'skills', 'cleanup', 'icon.bin'));
      expect(copiedBinary).toEqual(Buffer.from(binaryFixture));

      const readme = await readFile(join(outDir, 'README.md'), 'utf-8');
      expectNormalizedText(readme);
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
    }
  });

  test('preserves executable mode for normalized text files copied through directories', async () => {
    const sourceRoot = join(OUTPUT_ROOT, 'source-executable-normalized-tree');
    const outDir = join(OUTPUT_ROOT, 'executable-normalized-tree');
    const sourceScript = join(sourceRoot, 'skills', 'cleanup', 'install.sh');

    try {
      await ensureCleanDir(sourceRoot);
      await ensureCleanDir(outDir);
      await mkdir(join(sourceRoot, 'skills', 'cleanup'), { recursive: true });

      await writeFile(sourceScript, '#!/bin/sh\r\necho cleanup\r\n', 'utf-8');
      await chmod(sourceScript, 0o755);

      const ir: PluginIR = {
        id: 'codex--normalized-executable-text',
        source: {
          platform: 'codex',
          repoUrl: 'https://example.com/upstream',
          pluginPath: sourceRoot,
          commitSha: 'abc123',
          version: '1.0.0',
        },
        manifest: {
          name: 'normalized-executable-text',
          version: '1.0.0',
          description: 'Normalized executable text fixture',
          author: { name: 'Test' },
          raw: {},
        },
        components: {
          skills: [{ name: 'cleanup', path: 'skills/cleanup' }],
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

      const copiedScriptPath = join(outDir, 'skills', 'cleanup', 'install.sh');
      const copiedScript = await readFile(copiedScriptPath, 'utf-8');
      expectNormalizedText(copiedScript);
      expect(copiedScript).toBe('#!/bin/sh\necho cleanup\n');

      const sourceMode = (await stat(sourceScript)).mode & 0o777;
      const copiedMode = (await stat(copiedScriptPath)).mode & 0o777;
      expect(copiedMode & 0o111).toBe(sourceMode & 0o111);
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
    }
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

  test('README Source Path uses the logical plugin path instead of an absolute host path', async () => {
    const outDir = join(OUTPUT_ROOT, 'readme-relpath');
    await ensureCleanDir(outDir);

    const ir: PluginIR = {
      id: 'codex--readme-relpath-test',
      source: {
        platform: 'codex',
        repoUrl: 'https://example.com/upstream',
        pluginPath: '/absolute/host/path/to/cache/codex/plugins/readme-relpath-test',
        pluginRelPath: 'plugins/readme-relpath-test',
        commitSha: 'abc123',
        version: '1.0.0',
      },
      manifest: {
        name: 'readme-relpath-test',
        version: '1.0.0',
        description: 'README relative path test fixture',
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

    const readme = await readFile(join(outDir, 'README.md'), 'utf-8');
    expect(readme).toContain('- Source Path: plugins/readme-relpath-test');
    expect(readme).not.toContain('/absolute/host/path/to/cache/codex/plugins/readme-relpath-test');
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

  test('README lists generated markdown agents and hides source/private YAML agent filenames', async () => {
    const ir = await new CodexAdapter().parse(join(FIXTURES_DIR, 'codex-github'));
    const outDir = join(OUTPUT_ROOT, 'codex-readme-agent-list');

    await ensureCleanDir(outDir);
    await new VsCodePluginGenerator().generate(ir, outDir);

    const readme = await readFile(join(outDir, 'README.md'), 'utf-8');
    expect(readme).toContain('reviewer.md');
    expect(readme).toContain('tester.md');
    expect(readme).not.toContain('reviewer.yaml');
    expect(readme).not.toContain('tester.yml');
    expect(readme).not.toContain('openai.yaml');
  });

  test('removes stale generated agent files before writing fresh output', async () => {
    const ir = await new CodexAdapter().parse(join(FIXTURES_DIR, 'codex-github'));
    const outDir = join(OUTPUT_ROOT, 'codex-stale-output-cleanup');
    const agentsDir = join(outDir, 'agents');

    await ensureCleanDir(outDir);
    await mkdir(agentsDir, { recursive: true });
    await writeFile(join(agentsDir, 'openai.yaml'), 'stale private agent\n', 'utf-8');
    await writeFile(join(agentsDir, 'orphan.md'), 'stale generated agent\n', 'utf-8');

    await new VsCodePluginGenerator().generate(ir, outDir);

    await expect(stat(join(agentsDir, 'openai.yaml'))).rejects.toThrow();
    await expect(stat(join(agentsDir, 'orphan.md'))).rejects.toThrow();
    const readme = await readFile(join(outDir, 'README.md'), 'utf-8');
    expect(readme).not.toContain('openai.yaml');
    expect(readme).not.toContain('orphan.md');
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

  test('two agents whose names sanitize to the same filename throw a collision error', async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), 'collision-test-'));
    const outDir = join(OUTPUT_ROOT, 'collision-test');

    try {
      await ensureCleanDir(outDir);
      await mkdir(join(sourceRoot, 'agents'), { recursive: true });

      // "foo" and "../../foo" both sanitize to "foo"
      await writeFile(
        join(sourceRoot, 'agents', 'foo.yaml'),
        ['name: foo', 'description: First agent', 'developer_instructions: |', '  Body one.'].join('\n'),
        'utf-8'
      );
      await writeFile(
        join(sourceRoot, 'agents', 'traversal.yaml'),
        [
          'name: ../../foo',
          'description: Collision agent',
          'developer_instructions: |',
          '  Body two.',
        ].join('\n'),
        'utf-8'
      );

      const ir: PluginIR = {
        id: 'codex--collision-test',
        source: {
          platform: 'codex',
          repoUrl: 'https://example.com',
          pluginPath: sourceRoot,
          commitSha: 'abc123',
          version: '1.0.0',
        },
        manifest: {
          name: 'collision-test',
          version: '1.0.0',
          description: 'Collision test',
          author: { name: 'Test' },
          raw: {},
        },
        components: {
          skills: [],
          hooks: [],
          agents: [
            { name: 'foo', path: 'agents/foo.yaml', format: 'codex-yaml' },
            { name: 'traversal', path: 'agents/traversal.yaml', format: 'codex-yaml' },
          ],
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

      await expect(new VsCodePluginGenerator().generate(ir, outDir)).rejects.toThrow(/collision/i);
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
    }
  });

  test('agent name and description with tricky YAML characters produce valid frontmatter', async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), 'frontmatter-safety-'));
    const outDir = join(OUTPUT_ROOT, 'frontmatter-safety');

    try {
      await ensureCleanDir(outDir);
      await mkdir(join(sourceRoot, 'agents'), { recursive: true });

      // name contains a colon; description contains quotes and a newline embedded via YAML block scalar
      await writeFile(
        join(sourceRoot, 'agents', 'tricky.yaml'),
        [
          'name: "tricky: agent"',
          'description: He said "hello" and used: colons',
          'developer_instructions: |',
          '  Do the thing.',
        ].join('\n'),
        'utf-8'
      );

      const ir: PluginIR = {
        id: 'codex--frontmatter-safety',
        source: {
          platform: 'codex',
          repoUrl: 'https://example.com',
          pluginPath: sourceRoot,
          commitSha: 'abc123',
          version: '1.0.0',
        },
        manifest: {
          name: 'frontmatter-safety',
          version: '1.0.0',
          description: 'Frontmatter safety test',
          author: { name: 'Test' },
          raw: {},
        },
        components: {
          skills: [],
          hooks: [],
          agents: [{ name: 'tricky', path: 'agents/tricky.yaml', format: 'codex-yaml' }],
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

      const agentsDir = join(outDir, 'agents');
      const files = await readdir(agentsDir);
      expect(files).toHaveLength(1);

      const content = await readFile(join(agentsDir, files[0]), 'utf-8');

      // Frontmatter block must be present and closed
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
      expect(fmMatch).not.toBeNull();

      // The frontmatter lines for name and description must not break YAML:
      // values with colons or quotes must be quoted
      const fmBody = fmMatch![1];
      const nameLine = fmBody.split('\n').find((l) => l.startsWith('name:'))!;
      const descLine = fmBody.split('\n').find((l) => l.startsWith('description:'))!;

      // The value after "name: " must be a quoted string (starts with " or ')
      expect(nameLine).toMatch(/^name:\s*["'].+["']$/);
      // The value after "description: " must be a quoted string
      expect(descLine).toMatch(/^description:\s*["'].+["']$/);

      // Semantic check: the YAML source had `name: "tricky: agent"` (double-quoted
      // scalar). The parser must unwrap the outer quotes so the stored value is
      // `tricky: agent`, not `"tricky: agent"`. The generated frontmatter should
      // therefore contain `name: "tricky: agent"` (re-quoted because of the colon)
      // with no extra wrapping layer.
      expect(nameLine).toBe('name: "tricky: agent"');

      // Semantic check: the description was a plain scalar containing quotes and a
      // colon. The stored value must not have grown additional outer quote chars.
      expect(descLine).toBe('description: "He said \\"hello\\" and used: colons"');

      // Filename must not contain literal quote characters from the YAML source.
      expect(files[0]).not.toContain('"');
      expect(files[0]).not.toContain("'");

      // The body must still contain the instructions
      expect(content).toContain('Do the thing.');
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
    }
  });

  test('agent description containing a newline is represented safely in frontmatter', async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), 'newline-desc-'));
    const outDir = join(OUTPUT_ROOT, 'newline-desc');

    try {
      await ensureCleanDir(outDir);
      await mkdir(join(sourceRoot, 'agents'), { recursive: true });

      // Simulate a description that, after YAML parsing, would contain a newline
      // We embed it via a YAML block scalar so the parser produces an actual \n
      await writeFile(
        join(sourceRoot, 'agents', 'multiline.yaml'),
        // Use a plain name with no specials; only description is tricky
        [
          'name: multiline-agent',
          'description: "first line\\nsecond line"',
          'developer_instructions: |',
          '  Body text.',
        ].join('\n'),
        'utf-8'
      );

      const ir: PluginIR = {
        id: 'codex--newline-desc',
        source: {
          platform: 'codex',
          repoUrl: 'https://example.com',
          pluginPath: sourceRoot,
          commitSha: 'abc123',
          version: '1.0.0',
        },
        manifest: {
          name: 'newline-desc',
          version: '1.0.0',
          description: 'Newline in description test',
          author: { name: 'Test' },
          raw: {},
        },
        components: {
          skills: [],
          hooks: [],
          agents: [{ name: 'multiline', path: 'agents/multiline.yaml', format: 'codex-yaml' }],
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

      const content = await readFile(join(outDir, 'agents/multiline-agent.md'), 'utf-8');

      // The frontmatter block must be fully enclosed (closed with ---)
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
      expect(fmMatch).not.toBeNull();

      // No raw newline in a bare frontmatter value
      const fmBody = fmMatch![1];
      const descLine = fmBody.split('\n').find((l) => l.startsWith('description:'))!;
      // Must be on a single line (no embedded newline leaking into next frontmatter line)
      expect(descLine).toBeDefined();
      expect(descLine).not.toContain('\n');
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

  test('single-quoted YAML scalar names and descriptions are unwrapped, not double-quoted again', async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), 'single-quoted-'));
    const outDir = join(OUTPUT_ROOT, 'single-quoted');

    try {
      await ensureCleanDir(outDir);
      await mkdir(join(sourceRoot, 'agents'), { recursive: true });

      // Single-quoted YAML scalar: value is `it's simple` (with apostrophe via YAML '' escape)
      await writeFile(
        join(sourceRoot, 'agents', 'sq.yaml'),
        [
          "name: 'sq-agent'",
          "description: 'it''s simple'",
          'developer_instructions: |',
          '  Body text.',
        ].join('\n'),
        'utf-8'
      );

      const ir: PluginIR = {
        id: 'codex--single-quoted-test',
        source: {
          platform: 'codex',
          repoUrl: 'https://example.com',
          pluginPath: sourceRoot,
          commitSha: 'abc123',
          version: '1.0.0',
        },
        manifest: {
          name: 'single-quoted-test',
          version: '1.0.0',
          description: 'Single-quoted scalar test',
          author: { name: 'Test' },
          raw: {},
        },
        components: {
          skills: [],
          hooks: [],
          agents: [{ name: 'sq', path: 'agents/sq.yaml', format: 'codex-yaml' }],
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

      const agentsDir = join(outDir, 'agents');
      const files = await readdir(agentsDir);
      expect(files).toHaveLength(1);

      const content = await readFile(join(agentsDir, files[0]), 'utf-8');
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
      expect(fmMatch).not.toBeNull();

      const fmBody = fmMatch![1];
      const nameLine = fmBody.split('\n').find((l) => l.startsWith('name:'))!;
      const descLine = fmBody.split('\n').find((l) => l.startsWith('description:'))!;

      // Semantic: quotes unwrapped → value is `sq-agent`, no special chars, written bare
      expect(nameLine).toBe('name: sq-agent');

      // Semantic: `''` in single-quoted YAML is an escaped single-quote → value is `it's simple`
      // The apostrophe triggers quoting in the output frontmatter
      expect(descLine).toBe("description: \"it's simple\"");

      // Filename must not carry surrounding quote characters
      expect(files[0]).not.toContain("'");
      expect(files[0]).not.toContain('"');
      expect(files[0]).toBe('sq-agent.md');

      expect(content).toContain('Body text.');
    } finally {
      await rm(sourceRoot, { recursive: true, force: true });
    }
  });

  test('YAML reserved words and numeric-like values are quoted in frontmatter', async () => {
    // Regression: yamlQuoteIfNeeded must quote values that are valid YAML boolean/null
    // keywords or look like numbers, otherwise they would be parsed as non-strings.
    const reservedCases: Array<{ name: string; description: string }> = [
      { name: 'true', description: 'false' },
      { name: 'null', description: 'yes' },
      { name: 'on', description: 'off' },
      { name: 'no', description: 'true' },
      { name: '1234', description: '3.14' },
    ];

    for (const { name: agentName, description: agentDesc } of reservedCases) {
      const sourceRoot = await mkdtemp(join(tmpdir(), 'yaml-reserved-'));
      const outDir = join(OUTPUT_ROOT, `yaml-reserved-${agentName}`);

      try {
        await ensureCleanDir(outDir);
        await mkdir(join(sourceRoot, 'agents'), { recursive: true });

        // Use a safe file-name slug; the agent name is the reserved value itself
        await writeFile(
          join(sourceRoot, 'agents', 'agent.yaml'),
          [
            `name: "${agentName}"`,
            `description: "${agentDesc}"`,
            'developer_instructions: |',
            '  Instructions body.',
          ].join('\n'),
          'utf-8'
        );

        const ir: PluginIR = {
          id: `codex--yaml-reserved-${agentName}`,
          source: {
            platform: 'codex',
            repoUrl: 'https://example.com',
            pluginPath: sourceRoot,
            commitSha: 'abc123',
            version: '1.0.0',
          },
          manifest: {
            name: `yaml-reserved-${agentName}`,
            version: '1.0.0',
            description: 'YAML reserved word test',
            author: { name: 'Test' },
            raw: {},
          },
          components: {
            skills: [],
            hooks: [],
            agents: [{ name: 'agent', path: 'agents/agent.yaml', format: 'codex-yaml' }],
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

        const agentsDir = join(outDir, 'agents');
        const files = await readdir(agentsDir);
        expect(files).toHaveLength(1);

        const content = await readFile(join(agentsDir, files[0]), 'utf-8');
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
        expect(fmMatch).not.toBeNull();

        const fmBody = fmMatch![1];
        const nameLine = fmBody.split('\n').find((l) => l.startsWith('name:'))!;
        const descLine = fmBody.split('\n').find((l) => l.startsWith('description:'))!;

        // Both the reserved-word name and its description must be quoted so a YAML
        // parser won't coerce them to boolean/null/number types.
        expect(nameLine).toMatch(
          /^name:\s*["'].+["']$/,
          `name line for "${agentName}" must be quoted`
        );
        expect(descLine).toMatch(
          /^description:\s*["'].+["']$/,
          `description line for "${agentDesc}" must be quoted`
        );

        // Semantic: the round-tripped value must still equal the original string.
        expect(nameLine).toBe(`name: "${agentName}"`);
      } finally {
        await rm(sourceRoot, { recursive: true, force: true });
      }
    }
  });
});

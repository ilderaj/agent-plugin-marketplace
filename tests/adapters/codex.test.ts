import { describe, test, expect } from 'bun:test';
import { CodexAdapter } from '../../src/adapters/codex';
import { join } from 'path';

const FIXTURE = join(import.meta.dir, '../fixtures/codex-github');

describe('CodexAdapter', () => {
  const adapter = new CodexAdapter();

  test('platform and markerDir', () => {
    expect(adapter.platform).toBe('codex');
    expect(adapter.markerDir).toBe('.codex-plugin');
  });

  test('discover finds plugins with .codex-plugin/', async () => {
    const plugins = await adapter.discover(join(FIXTURE, '..'));
    expect(plugins.length).toBeGreaterThanOrEqual(1);
    const codexPlugin = plugins.find(p => p.name === 'codex-github');
    expect(codexPlugin).toBeDefined();
    expect(codexPlugin?.path).toContain('codex-github');
    expect(codexPlugin?.markerPath).toContain('.codex-plugin');
  });

  test('parse produces valid PluginIR', async () => {
    const ir = await adapter.parse(FIXTURE);
    expect(ir.id).toBe('codex--github');
    expect(ir.source.platform).toBe('codex');
    expect(ir.manifest.name).toBe('github');
    expect(ir.components.skills.length).toBeGreaterThan(0);
  });

  test('parse extracts manifest correctly', async () => {
    const ir = await adapter.parse(FIXTURE);
    expect(ir.manifest.name).toBe('github');
    expect(ir.manifest.version).toBe('1.0.0');
    expect(ir.manifest.description).toBe('GitHub integration plugin for Codex');
    expect(ir.manifest.author.name).toBe('OpenAI');
    expect(ir.manifest.author.email).toBe('support@openai.com');
    expect(ir.manifest.license).toBe('MIT');
    expect(ir.manifest.raw).toBeDefined();
  });

  test('parse extracts skills with hasScripts flag', async () => {
    const ir = await adapter.parse(FIXTURE);
    expect(ir.components.skills.length).toBe(1);
    const skill = ir.components.skills[0];
    expect(skill.name).toBe('github');
    expect(skill.path).toBe('skills/github');
    expect(typeof skill.hasScripts).toBe('boolean');
  });

  test('parse extracts hooks with events and format', async () => {
    const ir = await adapter.parse(FIXTURE);
    expect(ir.components.hooks.length).toBeGreaterThan(0);
    const hook = ir.components.hooks[0];
    expect(hook.configPath).toBe('hooks.json');
    expect(hook.format).toBe('codex');
    expect(Array.isArray(hook.events)).toBe(true);
    expect(hook.events).toContain('onPullRequest');
  });

  test('parse aggregates multiple hooks from same config file into single HookRef', async () => {
    const multiHooksFixture = join(import.meta.dir, '../fixtures/codex-hooks-multi');
    const ir = await adapter.parse(multiHooksFixture);
    
    // Should produce exactly ONE HookRef for the config file
    expect(ir.components.hooks.length).toBe(1);
    
    const hookRef = ir.components.hooks[0];
    expect(hookRef.configPath).toBe('hooks-multi.json');
    expect(hookRef.format).toBe('codex');
    
    // Events should be aggregated (deduplicated)
    expect(hookRef.events).toContain('onPullRequest');
    expect(hookRef.events).toContain('onCommit');
    expect(hookRef.events).toContain('onPush');
    
    // Should have exactly 3 unique events
    const uniqueEvents = new Set(hookRef.events);
    expect(uniqueEvents.size).toBe(3);
  });

  test('parse extracts app configuration', async () => {
    const ir = await adapter.parse(FIXTURE);
    expect(ir.components.apps.length).toBe(1);
    const app = ir.components.apps[0];
    expect(app.configPath).toBe('.app.json');
    expect(app.description).toBeDefined();
  });

  test('parse includes compatibility information', async () => {
    const ir = await adapter.parse(FIXTURE);
    expect(ir.compatibility.overall).toBeDefined();
    expect(Array.isArray(ir.compatibility.details)).toBe(true);
    expect(Array.isArray(ir.compatibility.warnings)).toBe(true);
    expect(Array.isArray(ir.compatibility.droppedComponents)).toBe(true);
  });

  test('compatibility overall is partial when components have partial/degraded compatibility', async () => {
    const ir = await adapter.parse(FIXTURE);
    
    // Current fixture has hooks (partial) and agents (partial), so overall should be partial
    // even though apps might be dropped
    expect(ir.compatibility.overall).toBe('partial');
    
    // Verify we have some partial/degraded components
    const partialOrDegraded = ir.compatibility.details.filter(
      d => d.level === 'partial' || d.level === 'degraded'
    );
    expect(partialOrDegraded.length).toBeGreaterThan(0);
  });

  test('compatibility overall logic considers both details and droppedComponents', async () => {
    const ir = await adapter.parse(FIXTURE);
    
    const hasPartialOrDegraded = ir.compatibility.details.some(
      d => d.level === 'partial' || d.level === 'degraded'
    );
    const hasDropped = ir.compatibility.droppedComponents.length > 0;
    
    // Overall should be partial if either condition is true
    if (hasPartialOrDegraded || hasDropped) {
      expect(ir.compatibility.overall).toBe('partial');
    } else {
      expect(ir.compatibility.overall).toBe('full');
    }
  });

  test('compatibility overall is partial when only details are partial (no dropped components)', async () => {
    const noAppFixture = join(import.meta.dir, '../fixtures/codex-no-app');
    const ir = await adapter.parse(noAppFixture);
    
    // This fixture has hooks (partial) and agents (partial) but no app to drop
    expect(ir.compatibility.droppedComponents.length).toBe(0);
    
    const hasPartialOrDegraded = ir.compatibility.details.some(
      d => d.level === 'partial' || d.level === 'degraded'
    );
    expect(hasPartialOrDegraded).toBe(true);
    
    // Overall should still be partial because of partial details
    expect(ir.compatibility.overall).toBe('partial');
  });

  test('compatibility marks apps as dropped for other platforms', async () => {
    const ir = await adapter.parse(FIXTURE);
    const droppedApps = ir.compatibility.droppedComponents.filter(c => c.type === 'app');
    expect(droppedApps.length).toBeGreaterThan(0);
    expect(droppedApps[0].reason).toContain('Codex-specific');
  });

  test('parse extracts agents with codex-yaml format', async () => {
    const ir = await adapter.parse(FIXTURE);
    expect(ir.components.agents.length).toBeGreaterThanOrEqual(1);
    const agent = ir.components.agents.find(a => a.name === 'reviewer');
    expect(agent).toBeDefined();
    expect(agent?.path).toBe('agents/reviewer.yaml');
    expect(agent?.format).toBe('codex-yaml');
  });

  test('parse extracts MCP servers with correct transport', async () => {
    const ir = await adapter.parse(FIXTURE);
    expect(ir.components.mcpServers.length).toBe(1);
    
    const mcpRef = ir.components.mcpServers[0];
    expect(mcpRef.configPath).toBe('.mcp.json');
    expect(mcpRef.servers.length).toBe(2);
    
    const githubServer = mcpRef.servers.find(s => s.name === 'github-mcp');
    expect(githubServer).toBeDefined();
    expect(githubServer?.transport).toBe('stdio');
    
    const fsServer = mcpRef.servers.find(s => s.name === 'filesystem');
    expect(fsServer).toBeDefined();
    expect(fsServer?.transport).toBe('sse');
  });

  test('parse correctly sets hasScripts to false when no scripts directory exists', async () => {
    const ir = await adapter.parse(FIXTURE);
    const skill = ir.components.skills[0];
    // Current fixture has no scripts/ directory, so hasScripts should be false
    expect(skill.hasScripts).toBe(false);
  });

  test('parseAgents supports both .yaml and .yml extensions', async () => {
    const ir = await adapter.parse(FIXTURE);
    
    // Should find both reviewer.yaml and tester.yml
    expect(ir.components.agents.length).toBe(2);
    
    const yamlAgent = ir.components.agents.find(a => a.name === 'reviewer');
    expect(yamlAgent).toBeDefined();
    expect(yamlAgent?.path).toBe('agents/reviewer.yaml');
    expect(yamlAgent?.format).toBe('codex-yaml');
    
    const ymlAgent = ir.components.agents.find(a => a.name === 'tester');
    expect(ymlAgent).toBeDefined();
    expect(ymlAgent?.path).toBe('agents/tester.yml');
    expect(ymlAgent?.format).toBe('codex-yaml');
  });

  test('discover returns empty array for non-existent directory (expected ENOENT)', async () => {
    const nonExistentPath = '/path/that/does/not/exist/at/all';
    const plugins = await adapter.discover(nonExistentPath);
    
    // Should gracefully return empty array for expected errors
    expect(Array.isArray(plugins)).toBe(true);
    expect(plugins.length).toBe(0);
  });

  test('parse throws on invalid JSON in plugin.json', async () => {
    const { mkdir, writeFile, rm } = await import('fs/promises');
    const { tmpdir } = await import('os');
    const { randomBytes } = await import('crypto');
    
    const tempDir = join(tmpdir(), `test-bad-json-${randomBytes(8).toString('hex')}`);
    const badJsonFixture = join(tempDir, 'bad-json-fixture');
    
    // Create a temporary fixture with invalid JSON
    await mkdir(join(badJsonFixture, '.codex-plugin'), { recursive: true });
    await writeFile(join(badJsonFixture, '.codex-plugin', 'plugin.json'), '{invalid json}');
    
    try {
      // Should throw, not silently return empty/default
      await expect(adapter.parse(badJsonFixture)).rejects.toThrow();
    } finally {
      // Clean up
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test('parseHooks throws on invalid JSON in hooks file', async () => {
    const { mkdir, writeFile, rm } = await import('fs/promises');
    const { tmpdir } = await import('os');
    const { randomBytes } = await import('crypto');
    
    const tempDir = join(tmpdir(), `test-bad-hooks-${randomBytes(8).toString('hex')}`);
    const badHooksFixture = join(tempDir, 'bad-hooks-fixture');
    
    await mkdir(join(badHooksFixture, '.codex-plugin'), { recursive: true });
    await mkdir(join(badHooksFixture, 'skills/test'), { recursive: true });
    
    const validPluginJson = {
      name: "test",
      version: "1.0.0",
      description: "test",
      author: { name: "test" },
      license: "MIT",
      skills: ["skills/test"],
      hooks: "hooks.json"
    };
    
    await writeFile(
      join(badHooksFixture, '.codex-plugin', 'plugin.json'),
      JSON.stringify(validPluginJson)
    );
    await writeFile(join(badHooksFixture, 'hooks.json'), '{invalid json}');
    await writeFile(
      join(badHooksFixture, 'skills/test/SKILL.md'),
      '---\nname: test\ndescription: test\n---\n# Test'
    );
    
    try {
      // Should throw on invalid hooks JSON, not silently ignore
      await expect(adapter.parse(badHooksFixture)).rejects.toThrow();
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test('fallback version: missing upstream version produces "0.0.0" in IR manifest and source', async () => {
    const noVersionFixture = join(import.meta.dir, '../fixtures/codex-no-version');
    const ir = await adapter.parse(noVersionFixture);
    expect(ir.manifest.version).toBe('0.0.0');
    expect(ir.source.version).toBe('0.0.0');
  });

  test('hooks compatibility: level is partial and note mentions format conversion, 5 events, and Bash-only tool interception', async () => {
    const ir = await adapter.parse(FIXTURE);
    const hookDetails = ir.compatibility.details.filter(d => d.type === 'hook');
    expect(hookDetails.length).toBeGreaterThan(0);
    for (const detail of hookDetails) {
      expect(detail.level).toBe('partial');
      expect(detail.notes).toContain('format conversion');
      expect(detail.notes).toContain('5 events');
      expect(detail.notes).toContain('Bash-only tool interception');
    }
  });
});

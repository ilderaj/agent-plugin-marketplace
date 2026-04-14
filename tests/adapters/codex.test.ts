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
    // Create a plugin config pointing to hooks-multi.json
    const fixtureDir = FIXTURE;
    const pluginJsonPath = join(fixtureDir, '.codex-plugin', 'plugin.json');
    const { readFile, writeFile } = await import('fs/promises');
    const originalContent = await readFile(pluginJsonPath, 'utf-8');
    const originalJson = JSON.parse(originalContent);
    
    // Temporarily modify plugin.json to point to hooks-multi.json
    const modifiedJson = { ...originalJson, hooks: 'hooks-multi.json' };
    await writeFile(pluginJsonPath, JSON.stringify(modifiedJson, null, 2));
    
    try {
      const ir = await adapter.parse(fixtureDir);
      
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
    } finally {
      // Restore original plugin.json
      await writeFile(pluginJsonPath, originalContent);
    }
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

  test('compatibility marks apps as dropped for other platforms', async () => {
    const ir = await adapter.parse(FIXTURE);
    const droppedApps = ir.compatibility.droppedComponents.filter(c => c.type === 'app');
    expect(droppedApps.length).toBeGreaterThan(0);
    expect(droppedApps[0].reason).toContain('Codex-specific');
  });

  test('parse extracts agents with codex-yaml format', async () => {
    const ir = await adapter.parse(FIXTURE);
    expect(ir.components.agents.length).toBe(1);
    const agent = ir.components.agents[0];
    expect(agent.name).toBe('reviewer');
    expect(agent.path).toBe('agents/reviewer.yaml');
    expect(agent.format).toBe('codex-yaml');
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
});

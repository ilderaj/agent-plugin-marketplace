import { describe, test, expect } from 'bun:test';
import { ClaudeAdapter } from '../../src/adapters/claude';
import { join } from 'path';
import { mkdir, rm } from 'fs/promises';
import { randomBytes } from 'crypto';

const FIXTURE = join(import.meta.dir, '../fixtures/claude-code-review');
const MD_COMMANDS_FIXTURE = join(import.meta.dir, '../fixtures/claude-with-md-commands');
const SCRATCH_ROOT = join(import.meta.dir, '../fixtures/.scratch/claude');

async function withScratchPlugin(
  name: string,
  run: (pluginDir: string) => Promise<void>,
) {
  const scratchDir = join(SCRATCH_ROOT, `${name}-${randomBytes(8).toString('hex')}`);
  const pluginDir = join(scratchDir, name);
  await mkdir(pluginDir, { recursive: true });

  try {
    await run(pluginDir);
  } finally {
    await rm(scratchDir, { recursive: true, force: true });
  }
}

describe('ClaudeAdapter', () => {
  const adapter = new ClaudeAdapter();

  test('platform and markerDir', () => {
    expect(adapter.platform).toBe('claude-code');
    expect(adapter.markerDir).toBe('.claude-plugin');
  });

  test('discover finds plugins with .claude-plugin/', async () => {
    const plugins = await adapter.discover(join(FIXTURE, '..'));
    expect(plugins.length).toBeGreaterThanOrEqual(1);
    const claudePlugin = plugins.find(p => p.name === 'claude-code-review');
    expect(claudePlugin).toBeDefined();
    expect(claudePlugin?.path).toContain('claude-code-review');
    expect(claudePlugin?.markerPath).toContain('.claude-plugin');
  });

  test('parse produces valid PluginIR', async () => {
    const ir = await adapter.parse(FIXTURE);
    expect(ir.id).toBe('claude-code--code-review');
    expect(ir.source.platform).toBe('claude-code');
    expect(ir.manifest.name).toBe('code-review');
    expect(ir.components.skills.length).toBeGreaterThan(0);
  });

  test('parse extracts manifest correctly', async () => {
    const ir = await adapter.parse(FIXTURE);
    expect(ir.manifest.name).toBe('code-review');
    expect(ir.manifest.version).toBe('2.1.0');
    expect(ir.manifest.description).toBe('Automated code review assistant for Claude Code');
    expect(ir.manifest.author.name).toBe('Anthropic');
    expect(ir.manifest.author.email).toBe('support@anthropic.com');
    expect(ir.manifest.license).toBe('MIT');
    expect(ir.manifest.raw).toBeDefined();
  });

  test('parse extracts skills with hasScripts flag', async () => {
    const ir = await adapter.parse(FIXTURE);
    expect(ir.components.skills.length).toBe(1);
    const skill = ir.components.skills[0];
    expect(skill.name).toBe('code-review');
    expect(skill.path).toBe('skills/code-review');
    expect(typeof skill.hasScripts).toBe('boolean');
  });

  test('parse extracts hooks with events and format', async () => {
    const ir = await adapter.parse(FIXTURE);
    expect(ir.components.hooks.length).toBeGreaterThan(0);
    const hook = ir.components.hooks[0];
    expect(hook.configPath).toBe('hooks/hooks.json');
    expect(hook.format).toBe('claude');
    expect(Array.isArray(hook.events)).toBe(true);
    expect(hook.events).toContain('onCommit');
  });

  test('parse extracts agents with claude-md format', async () => {
    const ir = await adapter.parse(FIXTURE);
    expect(ir.components.agents.length).toBeGreaterThanOrEqual(1);
    const agent = ir.components.agents.find(a => a.name === 'reviewer');
    expect(agent).toBeDefined();
    expect(agent?.path).toBe('agents/reviewer.md');
    expect(agent?.format).toBe('claude-md');
  });

  test('parse extracts commands', async () => {
    const ir = await adapter.parse(FIXTURE);
    expect(ir.components.commands.length).toBeGreaterThanOrEqual(1);
    const command = ir.components.commands.find(c => c.name === 'code-review');
    expect(command).toBeDefined();
    expect(command?.path).toBe('commands/code-review.md');
  });

  test('parse includes markdown command files', async () => {
    const ir = await adapter.parse(MD_COMMANDS_FIXTURE);

    expect(ir.components.commands.length).toBe(2);

    const summarize = ir.components.commands.find((command) => command.name === 'summarize');
    expect(summarize).toBeDefined();
    expect(summarize?.path).toBe('commands/summarize.md');

    const releaseNotes = ir.components.commands.find((command) => command.name === 'release-notes');
    expect(releaseNotes).toBeDefined();
    expect(releaseNotes?.path).toBe('commands/release-notes.md');
  });

  test('parse extracts MCP servers with correct transport', async () => {
    const ir = await adapter.parse(FIXTURE);
    expect(ir.components.mcpServers.length).toBe(1);
    
    const mcpRef = ir.components.mcpServers[0];
    expect(mcpRef.configPath).toBe('.mcp.json');
    expect(mcpRef.servers.length).toBe(2);
    
    const analyzerServer = mcpRef.servers.find(s => s.name === 'code-analyzer');
    expect(analyzerServer).toBeDefined();
    expect(analyzerServer?.transport).toBe('stdio');
    
    const linterServer = mcpRef.servers.find(s => s.name === 'linter');
    expect(linterServer).toBeDefined();
    expect(linterServer?.transport).toBe('sse');
  });

  test('parse prefers mcpServers key in .mcp.json', async () => {
    const { mkdir, writeFile } = await import('fs/promises');

    await withScratchPlugin('preferred-mcp-servers', async (pluginDir) => {
      await mkdir(join(pluginDir, '.claude-plugin'), { recursive: true });
      await writeFile(
        join(pluginDir, '.claude-plugin', 'plugin.json'),
        JSON.stringify({
          name: 'preferred-mcp-servers',
          version: '1.0.0',
          description: 'test plugin',
          author: { name: 'test' },
          license: 'MIT',
        }),
      );
      await writeFile(
        join(pluginDir, '.mcp.json'),
        JSON.stringify({
          mcpServers: {
            preferred: {
              command: 'npx',
              args: ['preferred'],
              transport: 'stdio',
            },
          },
          servers: {
            legacy: {
              command: 'npx',
              args: ['legacy'],
              transport: 'sse',
            },
          },
        }),
      );

      const ir = await adapter.parse(pluginDir);

      expect(ir.components.mcpServers).toHaveLength(1);
      expect(ir.components.mcpServers[0]).toEqual({
        configPath: '.mcp.json',
        servers: [{ name: 'preferred', transport: 'stdio' }],
      });
    });
  });

  test('parse reads legacy top-level servers from .mcp.json', async () => {
    const { mkdir, writeFile } = await import('fs/promises');

    await withScratchPlugin('legacy-mcp-servers', async (pluginDir) => {
      await mkdir(join(pluginDir, '.claude-plugin'), { recursive: true });
      await writeFile(
        join(pluginDir, '.claude-plugin', 'plugin.json'),
        JSON.stringify({
          name: 'legacy-mcp-servers',
          version: '1.0.0',
          description: 'test plugin',
          author: { name: 'test' },
          license: 'MIT',
        }),
      );
      await writeFile(
        join(pluginDir, '.mcp.json'),
        JSON.stringify({
          servers: {
            legacyAnalyzer: {
              command: 'npx',
              args: ['legacy-analyzer'],
              transport: 'sse',
            },
          },
        }),
      );

      const ir = await adapter.parse(pluginDir);

      expect(ir.components.mcpServers).toHaveLength(1);
      expect(ir.components.mcpServers[0]).toEqual({
        configPath: '.mcp.json',
        servers: [{ name: 'legacyAnalyzer', transport: 'sse' }],
      });
    });
  });

  test('parse includes compatibility information', async () => {
    const ir = await adapter.parse(FIXTURE);
    expect(ir.compatibility.overall).toBeDefined();
    expect(Array.isArray(ir.compatibility.details)).toBe(true);
    expect(Array.isArray(ir.compatibility.warnings)).toBe(true);
    expect(Array.isArray(ir.compatibility.droppedComponents)).toBe(true);
  });

  test('compatibility overall is partial when components have partial compatibility', async () => {
    const ir = await adapter.parse(FIXTURE);
    
    // Claude fixture has commands (partial), so overall should be partial even though hooks/agents are full
    expect(ir.compatibility.overall).toBe('partial');
    
    // Verify we have some partial components
    const partialOrDegraded = ir.compatibility.details.filter(
      d => d.level === 'partial' || d.level === 'degraded'
    );
    expect(partialOrDegraded.length).toBeGreaterThan(0);
  });

  test('compatibility notes explain VS Code relationship', async () => {
    const ir = await adapter.parse(FIXTURE);
    
    // Find hook compatibility detail
    const hookCompat = ir.compatibility.details.find(d => d.type === 'hook');
    expect(hookCompat).toBeDefined();
    expect(hookCompat?.notes).toContain('VS Code');
    
    // Find agent compatibility detail
    const agentCompat = ir.compatibility.details.find(d => d.type === 'agent');
    expect(agentCompat).toBeDefined();
    expect(agentCompat?.level).toBe('full');
    
    // Find command compatibility detail
    const commandCompat = ir.compatibility.details.find(d => d.type === 'command');
    expect(commandCompat).toBeDefined();
    expect(commandCompat?.level).toBe('partial');
  });

  test('command compatibility notes mention shell scripts and no VS Code equivalent', async () => {
    const ir = await adapter.parse(FIXTURE);
    const commandCompat = ir.compatibility.details.find(d => d.type === 'command');
    expect(commandCompat).toBeDefined();
    expect(commandCompat?.level).toBe('partial');
    expect(commandCompat?.notes).toContain('scripts/docs (.sh/.js/.ts/.md)');
    expect(commandCompat?.notes).toContain('no direct VS Code');
  });

  test('discover returns empty array for non-existent directory (expected ENOENT)', async () => {
    const nonExistentPath = '/path/that/does/not/exist/at/all';
    const plugins = await adapter.discover(nonExistentPath);
    
    // Should gracefully return empty array for expected errors
    expect(Array.isArray(plugins)).toBe(true);
    expect(plugins.length).toBe(0);
  });

  test('parse throws on invalid JSON in plugin.json', async () => {
    const { mkdir, writeFile } = await import('fs/promises');

    await withScratchPlugin('bad-json-fixture', async (badJsonFixture) => {
      await mkdir(join(badJsonFixture, '.claude-plugin'), { recursive: true });
      await writeFile(join(badJsonFixture, '.claude-plugin', 'plugin.json'), '{invalid json}');

      // Should throw, not silently return empty/default
      await expect(adapter.parse(badJsonFixture)).rejects.toThrow();
    });
  });

  test('parseHooks throws on invalid JSON in hooks file', async () => {
    const { mkdir, writeFile } = await import('fs/promises');

    await withScratchPlugin('bad-hooks-fixture', async (badHooksFixture) => {
      await mkdir(join(badHooksFixture, '.claude-plugin'), { recursive: true });
      await mkdir(join(badHooksFixture, 'skills/test'), { recursive: true });
      await mkdir(join(badHooksFixture, 'hooks'), { recursive: true });

      const validPluginJson = {
        name: "test",
        version: "1.0.0",
        description: "test",
        author: { name: "test" },
        license: "MIT"
      };

      await writeFile(
        join(badHooksFixture, '.claude-plugin', 'plugin.json'),
        JSON.stringify(validPluginJson)
      );
      await writeFile(join(badHooksFixture, 'hooks/hooks.json'), '{invalid json}');
      await writeFile(
        join(badHooksFixture, 'skills/test/SKILL.md'),
        '---\nname: test\ndescription: test\n---\n# Test'
      );

      // Should throw on invalid hooks JSON, not silently ignore
      await expect(adapter.parse(badHooksFixture)).rejects.toThrow();
    });
  });

  test('parseMcpServers throws on invalid JSON in .mcp.json', async () => {
    const { mkdir, writeFile } = await import('fs/promises');

    await withScratchPlugin('bad-mcp-fixture', async (badMcpFixture) => {
      await mkdir(join(badMcpFixture, '.claude-plugin'), { recursive: true });
      await mkdir(join(badMcpFixture, 'skills/test'), { recursive: true });

      const validPluginJson = {
        name: "test",
        version: "1.0.0",
        description: "test",
        author: { name: "test" },
        license: "MIT"
      };

      await writeFile(
        join(badMcpFixture, '.claude-plugin', 'plugin.json'),
        JSON.stringify(validPluginJson)
      );
      await writeFile(join(badMcpFixture, '.mcp.json'), '{invalid json}');
      await writeFile(
        join(badMcpFixture, 'skills/test/SKILL.md'),
        '---\nname: test\ndescription: test\n---\n# Test'
      );

      // Should throw on invalid .mcp.json, not silently ignore
      await expect(adapter.parse(badMcpFixture)).rejects.toThrow();
    });
  });

  test('parse correctly handles missing optional components', async () => {
    const { mkdir, writeFile } = await import('fs/promises');

    await withScratchPlugin('minimal-fixture', async (minimalFixture) => {
      await mkdir(join(minimalFixture, '.claude-plugin'), { recursive: true });

      const minimalPluginJson = {
        name: "minimal",
        version: "1.0.0",
        description: "Minimal plugin",
        author: { name: "test" },
        license: "MIT"
      };

      await writeFile(
        join(minimalFixture, '.claude-plugin', 'plugin.json'),
        JSON.stringify(minimalPluginJson)
      );

      const ir = await adapter.parse(minimalFixture);

      // Should successfully parse with empty arrays for optional components
      expect(ir.components.skills.length).toBe(0);
      expect(ir.components.hooks.length).toBe(0);
      expect(ir.components.agents.length).toBe(0);
      expect(ir.components.commands.length).toBe(0);
      expect(ir.components.mcpServers.length).toBe(0);
      
      // Overall compatibility should be 'full' when no partial components exist
      expect(ir.compatibility.overall).toBe('full');
    });
  });

  test('parse correctly sets hasScripts to false when no scripts directory exists', async () => {
    const ir = await adapter.parse(FIXTURE);
    const skill = ir.components.skills[0];
    // Current fixture has no scripts/ directory, so hasScripts should be false
    expect(skill.hasScripts).toBe(false);
  });

  test('parseAgents only includes .md files', async () => {
    const { mkdir, writeFile } = await import('fs/promises');

    await withScratchPlugin('agents-fixture', async (agentsFixture) => {
      await mkdir(join(agentsFixture, '.claude-plugin'), { recursive: true });
      await mkdir(join(agentsFixture, 'agents'), { recursive: true });

      const pluginJson = {
        name: "test",
        version: "1.0.0",
        description: "test",
        author: { name: "test" }
      };

      await writeFile(
        join(agentsFixture, '.claude-plugin', 'plugin.json'),
        JSON.stringify(pluginJson)
      );

      // Create .md file (should be included)
      await writeFile(join(agentsFixture, 'agents/agent1.md'), '# Agent 1');
      // Create non-.md files (should be ignored)
      await writeFile(join(agentsFixture, 'agents/config.json'), '{}');
      await writeFile(join(agentsFixture, 'agents/script.sh'), '#!/bin/bash');

      const ir = await adapter.parse(agentsFixture);

      // Should only have 1 agent (.md file)
      expect(ir.components.agents.length).toBe(1);
      expect(ir.components.agents[0].name).toBe('agent1');
      expect(ir.components.agents[0].format).toBe('claude-md');
    });
  });

  test('parseCommands supports .sh, .js, .ts, and .md extensions', async () => {
    const { mkdir, writeFile } = await import('fs/promises');

    await withScratchPlugin('commands-fixture', async (commandsFixture) => {
      await mkdir(join(commandsFixture, '.claude-plugin'), { recursive: true });
      await mkdir(join(commandsFixture, 'commands'), { recursive: true });

      const pluginJson = {
        name: "test",
        version: "1.0.0",
        description: "test",
        author: { name: "test" }
      };

      await writeFile(
        join(commandsFixture, '.claude-plugin', 'plugin.json'),
        JSON.stringify(pluginJson)
      );

      // Create command files with different extensions
      await writeFile(join(commandsFixture, 'commands/build.sh'), '#!/bin/bash');
      await writeFile(join(commandsFixture, 'commands/deploy.js'), 'console.log("deploy");');
      await writeFile(join(commandsFixture, 'commands/test.ts'), 'console.log("test");');
      await writeFile(join(commandsFixture, 'commands/review.md'), '---\ndescription: Review changes\nallowed-tools: Bash\n---\nReview code.');
      // Non-command file (should be ignored)
      await writeFile(join(commandsFixture, 'commands/README.txt'), 'Commands');

      const ir = await adapter.parse(commandsFixture);

      // Should have 4 commands
      expect(ir.components.commands.length).toBe(4);
      
      const buildCmd = ir.components.commands.find(c => c.name === 'build');
      expect(buildCmd).toBeDefined();
      expect(buildCmd?.path).toBe('commands/build.sh');
      
      const deployCmd = ir.components.commands.find(c => c.name === 'deploy');
      expect(deployCmd).toBeDefined();
      expect(deployCmd?.path).toBe('commands/deploy.js');
      
      const testCmd = ir.components.commands.find(c => c.name === 'test');
      expect(testCmd).toBeDefined();
      expect(testCmd?.path).toBe('commands/test.ts');

      const reviewCmd = ir.components.commands.find(c => c.name === 'review');
      expect(reviewCmd).toBeDefined();
      expect(reviewCmd?.path).toBe('commands/review.md');
    });
  });

  test('parseHooks aggregates multiple hooks from same config file into single HookRef', async () => {
    const { mkdir, writeFile } = await import('fs/promises');

    await withScratchPlugin('multi-hooks-fixture', async (multiHooksFixture) => {
      await mkdir(join(multiHooksFixture, '.claude-plugin'), { recursive: true });
      await mkdir(join(multiHooksFixture, 'hooks'), { recursive: true });

      const pluginJson = {
        name: "test",
        version: "1.0.0",
        description: "test",
        author: { name: "test" }
      };

      const hooksJson = {
        hooks: [
          { name: "hook1", events: ["onCommit", "onPush"] },
          { name: "hook2", events: ["onPullRequest", "onCommit"] },
          { name: "hook3", events: ["onDeploy"] }
        ]
      };

      await writeFile(
        join(multiHooksFixture, '.claude-plugin', 'plugin.json'),
        JSON.stringify(pluginJson)
      );
      await writeFile(
        join(multiHooksFixture, 'hooks/hooks.json'),
        JSON.stringify(hooksJson)
      );

      const ir = await adapter.parse(multiHooksFixture);

      // Should produce exactly ONE HookRef for the config file
      expect(ir.components.hooks.length).toBe(1);
      
      const hookRef = ir.components.hooks[0];
      expect(hookRef.configPath).toBe('hooks/hooks.json');
      expect(hookRef.format).toBe('claude');
      
      // Events should be aggregated (deduplicated)
      expect(hookRef.events).toContain('onCommit');
      expect(hookRef.events).toContain('onPush');
      expect(hookRef.events).toContain('onPullRequest');
      expect(hookRef.events).toContain('onDeploy');
      
      // Should have exactly 4 unique events
      const uniqueEvents = new Set(hookRef.events);
      expect(uniqueEvents.size).toBe(4);
    });
  });

  test('hooks compatibility is full because VS Code natively reads Claude hook format', async () => {
    const ir = await adapter.parse(FIXTURE);

    const hookCompat = ir.compatibility.details.find(d => d.type === 'hook');
    expect(hookCompat).toBeDefined();
    expect(hookCompat?.level).toBe('full');
    expect(hookCompat?.notes).toContain('natively');
  });

  test('agents compatibility is full because VS Code natively reads .claude/agents/*.md', async () => {
    const ir = await adapter.parse(FIXTURE);

    const agentCompat = ir.compatibility.details.find(d => d.type === 'agent');
    expect(agentCompat).toBeDefined();
    expect(agentCompat?.level).toBe('full');
    expect(agentCompat?.notes).toContain('natively');
  });

  test('overall compatibility is full when plugin has only hooks and agents (no commands)', async () => {
    const { mkdir, writeFile } = await import('fs/promises');

    await withScratchPlugin('hooks-agents-fixture', async (pluginDir) => {
      await mkdir(join(pluginDir, '.claude-plugin'), { recursive: true });
      await mkdir(join(pluginDir, 'hooks'), { recursive: true });
      await mkdir(join(pluginDir, 'agents'), { recursive: true });

      await writeFile(
        join(pluginDir, '.claude-plugin', 'plugin.json'),
        JSON.stringify({ name: 'hooks-agents-only', version: '1.0.0', description: 'test', author: { name: 'test' } })
      );
      await writeFile(
        join(pluginDir, 'hooks/hooks.json'),
        JSON.stringify({ hooks: [{ name: 'pre-commit', events: ['onCommit'] }] })
      );
      await writeFile(join(pluginDir, 'agents/helper.md'), '# Helper Agent');

      const ir = await adapter.parse(pluginDir);

      expect(ir.components.hooks.length).toBe(1);
      expect(ir.components.agents.length).toBe(1);
      expect(ir.components.commands.length).toBe(0);
      expect(ir.compatibility.overall).toBe('full');
    });
  });
});

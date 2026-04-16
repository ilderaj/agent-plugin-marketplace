import { describe, test, expect } from 'bun:test';
import { CursorAdapter } from '../../src/adapters/cursor';
import { join } from 'path';
import { mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

const FIXTURE = join(import.meta.dir, '../fixtures/cursor-continual-learning');

async function withTempPlugin(
  name: string,
  setup: (pluginRoot: string) => Promise<void>,
  run: (pluginRoot: string) => Promise<void>
) {
  const tempRoot = join(
    tmpdir(),
    `cursor-adapter-${name}-${randomBytes(6).toString('hex')}`
  );
  const pluginRoot = join(tempRoot, name);

  await setup(pluginRoot);
  try {
    await run(pluginRoot);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

describe('CursorAdapter', () => {
  const adapter = new CursorAdapter();

  test('platform and markerDir', () => {
    expect(adapter.platform).toBe('cursor');
    expect(adapter.markerDir).toBe('.cursor-plugin');
  });

  test('discover finds plugins with .cursor-plugin/', async () => {
    const plugins = await adapter.discover(join(FIXTURE, '..'));
    expect(plugins.length).toBeGreaterThanOrEqual(1);
    const cursorPlugin = plugins.find(p => p.name === 'cursor-continual-learning');
    expect(cursorPlugin).toBeDefined();
    expect(cursorPlugin?.path).toContain('cursor-continual-learning');
    expect(cursorPlugin?.markerPath).toContain('.cursor-plugin');
  });

  test('parse produces valid PluginIR', async () => {
    const ir = await adapter.parse(FIXTURE);
    expect(ir.id).toBe('cursor--continual-learning');
    expect(ir.source.platform).toBe('cursor');
    expect(ir.manifest.name).toBe('continual-learning');
    expect(ir.components.skills.length).toBeGreaterThan(0);
  });

  test('parse extracts manifest correctly', async () => {
    const ir = await adapter.parse(FIXTURE);
    expect(ir.manifest.name).toBe('continual-learning');
    expect(ir.manifest.version).toBe('0.8.0');
    expect(ir.manifest.description).toBe('Continual learning and knowledge accumulation for Cursor');
    expect(ir.manifest.author.name).toBe('Cursor Team');
    expect(ir.manifest.author.email).toBe('hello@cursor.com');
    expect(ir.manifest.license).toBe('Apache-2.0');
    expect(ir.manifest.raw).toBeDefined();
  });

  test('parse extracts skills from manifest paths', async () => {
    const ir = await adapter.parse(FIXTURE);
    expect(ir.components.skills.length).toBe(1);
    const skill = ir.components.skills[0];
    expect(skill.name).toBe('learning');
    expect(skill.path).toBe('skills/learning');
    expect(typeof skill.hasScripts).toBe('boolean');
  });

  test('parse extracts agents with cursor-md format', async () => {
    const ir = await adapter.parse(FIXTURE);
    expect(ir.components.agents.length).toBe(1);
    const agent = ir.components.agents[0];
    expect(agent.name).toBe('learner');
    expect(agent.path).toBe('agents/learner.md');
    expect(agent.format).toBe('cursor-md');
  });

  test('parse extracts hooks with events and cursor format', async () => {
    const ir = await adapter.parse(FIXTURE);
    expect(ir.components.hooks.length).toBe(1);
    const hook = ir.components.hooks[0];
    expect(hook.configPath).toBe('hooks/hooks.json');
    expect(hook.format).toBe('cursor');
    expect(hook.events).toEqual(['onCodeChange', 'onFileSave']);
  });

  test('parse aggregates hook events into single HookRef per config file', async () => {
    const ir = await adapter.parse(FIXTURE);
    
    // Should produce exactly ONE HookRef for the config file
    expect(ir.components.hooks.length).toBe(1);
    
    const hookRef = ir.components.hooks[0];
    expect(hookRef.configPath).toBe('hooks/hooks.json');
    expect(hookRef.format).toBe('cursor');
    
    // Events should be aggregated (deduplicated)
    expect(hookRef.events).toContain('onCodeChange');
    expect(hookRef.events).toContain('onFileSave');
    
    // Should have deduplicated to 2 unique events
    const uniqueEvents = new Set(hookRef.events);
    expect(uniqueEvents.size).toBe(2);
  });

  test('parse extracts rules with alwaysApply and globs from frontmatter', async () => {
    const ir = await adapter.parse(FIXTURE);
    expect(ir.components.rules.length).toBe(3);
    
    const alwaysRule = ir.components.rules.find(r => r.path.includes('learning-context'));
    expect(alwaysRule).toBeDefined();
    expect(alwaysRule?.alwaysApply).toBe(true);
    expect(alwaysRule?.globs).toBeUndefined();
    
    const tsRule = ir.components.rules.find(r => r.path.includes('typescript-rules'));
    expect(tsRule).toBeDefined();
    expect(tsRule?.alwaysApply).toBe(false);
    expect(tsRule?.globs).toBeDefined();
    expect(tsRule?.globs).toContain('**/*.ts');
    expect(tsRule?.globs).toContain('**/*.tsx');

    const intelligentRule = ir.components.rules.find(r => r.path.includes('intelligent-rule'));
    expect(intelligentRule).toBeDefined();
    expect(intelligentRule?.alwaysApply).toBe(false);
    expect(intelligentRule?.globs).toBeUndefined();
  });

  test('parse rules accepts description frontmatter without failing', async () => {
    const ir = await adapter.parse(FIXTURE);
    const alwaysRule = ir.components.rules.find(r => r.path.includes('learning-context'));
    expect(alwaysRule).toBeDefined();
    expect(alwaysRule?.alwaysApply).toBe(true);
  });

  test('parse extracts commands from manifest paths', async () => {
    const ir = await adapter.parse(FIXTURE);
    expect(ir.components.commands.length).toBe(1);
    const command = ir.components.commands[0];
    expect(command.name).toBe('analyze.sh');
    expect(command.path).toBe('commands/analyze.sh');
  });

  test('parse extracts MCP servers from mcp.json', async () => {
    const ir = await adapter.parse(FIXTURE);
    expect(ir.components.mcpServers.length).toBe(1);
    
    const mcpRef = ir.components.mcpServers[0];
    expect(mcpRef.configPath).toBe('mcp.json');
    expect(mcpRef.servers.length).toBe(1);
    
    const learningServer = mcpRef.servers.find(s => s.name === 'learning-server');
    expect(learningServer).toBeDefined();
    expect(learningServer?.transport).toBe('stdio');
  });

  test('parse includes compatibility information', async () => {
    const ir = await adapter.parse(FIXTURE);
    expect(ir.compatibility.overall).toBe('partial');
    expect(Array.isArray(ir.compatibility.details)).toBe(true);
    expect(Array.isArray(ir.compatibility.warnings)).toBe(true);
    expect(Array.isArray(ir.compatibility.droppedComponents)).toBe(true);
  });

  test('compatibility overall considers partial/degraded components and dropped items', async () => {
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

  test('compatibility marks rules as partially compatible via VS Code instructions conversion', async () => {
    const ir = await adapter.parse(FIXTURE);
    const ruleDetails = ir.compatibility.details.filter(c => c.type === 'rule');
    expect(ruleDetails).toHaveLength(3);
    expect(ruleDetails.every(detail => detail.level === 'partial')).toBe(true);
    expect(ruleDetails.every(detail => detail.notes.includes('.instructions.md'))).toBe(true);

    // Apply Intelligently rule should mention the broad mapping and indistinguishable modes
    const intelligentDetail = ruleDetails.find(d => d.name.includes('intelligent-rule'));
    expect(intelligentDetail?.notes).toContain('indistinguishable in frontmatter');

    const droppedRules = ir.compatibility.droppedComponents.filter(c => c.type === 'rule');
    expect(droppedRules).toHaveLength(0);
    expect(ir.compatibility.warnings.some(w => w.includes('.instructions.md'))).toBe(true);
    expect(ir.compatibility.warnings.some(w => w.includes('indistinguishable in frontmatter'))).toBe(true);
    expect(ir.compatibility.warnings.some(w => w.includes('on-demand (Apply Manually)'))).toBe(true);
    // Conversion warning and broad-mapping warning must be separate entries
    expect(ir.compatibility.warnings.length).toBeGreaterThanOrEqual(2);
  });

  test('parse stays manifest-driven when default directories exist but manifest omits them', async () => {
    await withTempPlugin(
      'manifest-driven',
      async (pluginRoot) => {
        await mkdir(join(pluginRoot, '.cursor-plugin'), { recursive: true });
        await mkdir(join(pluginRoot, 'agents'), { recursive: true });
        await mkdir(join(pluginRoot, 'commands'), { recursive: true });
        await mkdir(join(pluginRoot, 'rules'), { recursive: true });
        await mkdir(join(pluginRoot, 'skills/learning'), { recursive: true });

        await writeFile(
          join(pluginRoot, '.cursor-plugin', 'plugin.json'),
          JSON.stringify({
            name: 'manifest-driven',
            version: '1.0.0',
            description: 'manifest-driven fixture',
            author: { name: 'Cursor Team' },
            skills: ['skills/learning']
          })
        );
        await writeFile(
          join(pluginRoot, 'skills/learning/SKILL.md'),
          '---\nname: learning\ndescription: learning\n---\n# Skill\n'
        );
        await writeFile(join(pluginRoot, 'agents/ignored.md'), '# ignored\n');
        await writeFile(join(pluginRoot, 'commands/ignored.sh'), 'echo ignored\n');
        await writeFile(
          join(pluginRoot, 'rules/ignored.mdc'),
          '---\nalwaysApply: true\n---\n# ignored\n'
        );
      },
      async (pluginRoot) => {
        const ir = await adapter.parse(pluginRoot);

        expect(ir.components.skills).toHaveLength(1);
        expect(ir.components.agents).toHaveLength(0);
        expect(ir.components.commands).toHaveLength(0);
        expect(ir.components.rules).toHaveLength(0);
        expect(ir.components.hooks).toHaveLength(0);
        expect(ir.components.mcpServers).toHaveLength(0);
      }
    );
  });

  test('parse resolves MCP configs declared via manifest mcpServers path', async () => {
    await withTempPlugin(
      'mcp-servers-path',
      async (pluginRoot) => {
        await mkdir(join(pluginRoot, '.cursor-plugin'), { recursive: true });

        await writeFile(
          join(pluginRoot, '.cursor-plugin', 'plugin.json'),
          JSON.stringify({
            name: 'mcp-servers-path',
            version: '1.0.0',
            description: 'manifest mcpServers path',
            author: { name: 'Cursor Team' },
            mcpServers: 'configs/mcp.json'
          })
        );
        await mkdir(join(pluginRoot, 'configs'), { recursive: true });
        await writeFile(
          join(pluginRoot, 'configs', 'mcp.json'),
          JSON.stringify({
            mcpServers: {
              docs: {
                command: 'docs-server'
              }
            }
          })
        );
      },
      async (pluginRoot) => {
        const ir = await adapter.parse(pluginRoot);
        expect(ir.components.mcpServers).toEqual([
          {
            configPath: 'configs/mcp.json',
            servers: [{ name: 'docs', transport: 'stdio' }]
          }
        ]);
      }
    );
  });

  test('parse expands manifest directory paths for skills, agents, and rules', async () => {
    await withTempPlugin(
      'directory-paths',
      async (pluginRoot) => {
        await mkdir(join(pluginRoot, '.cursor-plugin'), { recursive: true });
        await mkdir(join(pluginRoot, 'skills/one'), { recursive: true });
        await mkdir(join(pluginRoot, 'skills/two'), { recursive: true });
        await mkdir(join(pluginRoot, 'agents'), { recursive: true });
        await mkdir(join(pluginRoot, 'rules'), { recursive: true });

        await writeFile(
          join(pluginRoot, '.cursor-plugin', 'plugin.json'),
          JSON.stringify({
            name: 'directory-paths',
            version: '1.0.0',
            description: 'directory style paths',
            author: { name: 'Cursor Team' },
            skills: './skills/',
            agents: './agents/',
            rules: './rules/',
          }),
        );
        await writeFile(
          join(pluginRoot, 'skills/one/SKILL.md'),
          '---\nname: one\ndescription: one\n---\n# One\n',
        );
        await writeFile(
          join(pluginRoot, 'skills/two/SKILL.md'),
          '---\nname: two\ndescription: two\n---\n# Two\n',
        );
        await writeFile(join(pluginRoot, 'agents/first.md'), '# First\n');
        await writeFile(
          join(pluginRoot, 'rules/first-rule.mdc'),
          '---\nalwaysApply: true\ndescription: first rule\n---\n# Rule\n',
        );
      },
      async (pluginRoot) => {
        const ir = await adapter.parse(pluginRoot);

        expect(ir.components.skills.map(skill => skill.name).sort()).toEqual(['one', 'two']);
        expect(ir.components.agents.map(agent => agent.name)).toEqual(['first']);
        expect(ir.components.rules.map(rule => rule.path)).toEqual(['rules/first-rule.mdc']);
      },
    );
  });

  test('discover returns empty array for non-existent directory (expected ENOENT)', async () => {
    const nonExistentPath = '/path/that/does/not/exist/at/all';
    const plugins = await adapter.discover(nonExistentPath);
    
    // Should gracefully return empty array for expected errors
    expect(Array.isArray(plugins)).toBe(true);
    expect(plugins.length).toBe(0);
  });

  test('broad-mapping warning is omitted when no rule has alwaysApply:false with no globs', async () => {
    await withTempPlugin(
      'no-intelligent-rules',
      async (pluginRoot) => {
        await mkdir(join(pluginRoot, '.cursor-plugin'), { recursive: true });
        await mkdir(join(pluginRoot, 'rules'), { recursive: true });

        await writeFile(
          join(pluginRoot, '.cursor-plugin', 'plugin.json'),
          JSON.stringify({
            name: 'no-intelligent-rules',
            version: '1.0.0',
            description: 'only always-apply and glob rules',
            author: { name: 'Test' },
            rules: ['rules/always.mdc', 'rules/glob-rule.mdc'],
          })
        );
        await writeFile(
          join(pluginRoot, 'rules/always.mdc'),
          '---\nalwaysApply: true\ndescription: always rule\n---\n# Always\n'
        );
        await writeFile(
          join(pluginRoot, 'rules/glob-rule.mdc'),
          '---\nalwaysApply: false\nglobs:\n- **/*.ts\n---\n# Glob Rule\n'
        );
      },
      async (pluginRoot) => {
        const ir = await adapter.parse(pluginRoot);
        // General conversion warning must be present
        expect(ir.compatibility.warnings.some(w => w.includes('.instructions.md'))).toBe(true);
        // Broad-mapping warning must NOT be present when no intelligent-mode rules exist
        expect(ir.compatibility.warnings.some(w => w.includes('indistinguishable in frontmatter'))).toBe(false);
        expect(ir.compatibility.warnings.some(w => w.includes('on-demand (Apply Manually)'))).toBe(false);
      }
    );
  });

  test('parse throws on invalid JSON in plugin.json', async () => {
    await withTempPlugin(
      'bad-json-fixture',
      async (pluginRoot) => {
        await mkdir(join(pluginRoot, '.cursor-plugin'), { recursive: true });
        await writeFile(join(pluginRoot, '.cursor-plugin', 'plugin.json'), '{invalid json}');
      },
      async (pluginRoot) => {
        await expect(adapter.parse(pluginRoot)).rejects.toThrow();
      }
    );
  });

  test('parseHooks throws on invalid JSON in hooks file', async () => {
    await withTempPlugin(
      'bad-hooks-fixture',
      async (pluginRoot) => {
        await mkdir(join(pluginRoot, '.cursor-plugin'), { recursive: true });
        await mkdir(join(pluginRoot, 'skills/test'), { recursive: true });
        await mkdir(join(pluginRoot, 'hooks'), { recursive: true });

        await writeFile(
          join(pluginRoot, '.cursor-plugin', 'plugin.json'),
          JSON.stringify({
            name: 'test',
            version: '1.0.0',
            description: 'test',
            author: { name: 'test' },
            license: 'MIT',
            skills: ['skills/test'],
            hooks: 'hooks/bad.json'
          })
        );
        await writeFile(join(pluginRoot, 'hooks/bad.json'), '{invalid json}');
        await writeFile(
          join(pluginRoot, 'skills/test/SKILL.md'),
          '---\nname: test\ndescription: test\n---\n# Test'
        );
      },
      async (pluginRoot) => {
        await expect(adapter.parse(pluginRoot)).rejects.toThrow();
      }
    );
  });

  test('parseRules throws on invalid frontmatter', async () => {
    await withTempPlugin(
      'bad-rule-fixture',
      async (pluginRoot) => {
        await mkdir(join(pluginRoot, '.cursor-plugin'), { recursive: true });
        await mkdir(join(pluginRoot, 'rules'), { recursive: true });

        await writeFile(
          join(pluginRoot, '.cursor-plugin', 'plugin.json'),
          JSON.stringify({
            name: 'test',
            version: '1.0.0',
            description: 'test',
            author: { name: 'test' },
            license: 'MIT',
            rules: ['rules/bad.mdc']
          })
        );
        await writeFile(
          join(pluginRoot, 'rules/bad.mdc'),
          '---\n{invalid: yaml: structure\n---\n# Rule'
        );
      },
      async (pluginRoot) => {
        await expect(adapter.parse(pluginRoot)).rejects.toThrow();
      }
    );
  });

  test('parseMcp throws on invalid JSON in mcp.json', async () => {
    await withTempPlugin(
      'bad-mcp-fixture',
      async (pluginRoot) => {
        await mkdir(join(pluginRoot, '.cursor-plugin'), { recursive: true });

        await writeFile(
          join(pluginRoot, '.cursor-plugin', 'plugin.json'),
          JSON.stringify({
            name: 'test',
            version: '1.0.0',
            description: 'test',
            author: { name: 'test' },
            license: 'MIT',
            mcp: 'mcp.json'
          })
        );
        await writeFile(join(pluginRoot, 'mcp.json'), '{invalid json}');
      },
      async (pluginRoot) => {
        await expect(adapter.parse(pluginRoot)).rejects.toThrow();
      }
    );
  });
});

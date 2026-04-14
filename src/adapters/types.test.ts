import { describe, test, expect } from 'bun:test';
import type {
  Platform,
  HookFormat,
  CompatLevel,
  SourceAdapter,
  DiscoveredPlugin,
  PluginIR,
  SourceInfo,
  ManifestInfo,
  ManifestAuthor,
  Components,
  SkillRef,
  HookRef,
  AgentRef,
  CommandRef,
  McpRef,
  McpServerRef,
  RuleRef,
  AppRef,
  Compatibility,
  ComponentCompat,
  DroppedComponent,
} from './types';

describe('Type Definitions - MVP 4.3 Spec', () => {
  describe('Base Types', () => {
    test('Platform type accepts valid values', () => {
      const platforms: Platform[] = ['codex', 'claude-code', 'cursor'];
      expect(platforms).toHaveLength(3);
    });

    test('CompatLevel type accepts valid values', () => {
      const levels: CompatLevel[] = ['full', 'partial', 'degraded', 'unsupported'];
      expect(levels).toHaveLength(4);
    });

    test('HookFormat is distinct from Platform - represents hook config format not source platform', () => {
      const hookFormat: HookFormat = 'claude';
      const platform: Platform = 'claude-code';
      // HookFormat represents the hook configuration format (e.g., 'claude' config style)
      // Platform represents the source/origin platform (e.g., 'claude-code' agent)
      // They are semantically different even if they share similar string values
      expect(hookFormat).toBe('claude');
      expect(platform).toBe('claude-code');
    });

    test('HookFormat type accepts valid component format values', () => {
      const formats: HookFormat[] = ['claude', 'codex', 'cursor'];
      expect(formats).toHaveLength(3);
    });
  });

  describe('SourceAdapter', () => {
    test('has required platform and markerDir properties', () => {
      const adapter: SourceAdapter = {
        platform: 'codex',
        markerDir: '.agents',
        discover: async () => [],
        parse: async () => ({
          id: 'test',
          source: {
            platform: 'codex',
            repoUrl: 'https://github.com/test/test',
            pluginPath: '/test',
            commitSha: 'abc123',
            version: '1.0.0',
          },
          manifest: {
            name: 'Test',
            version: '1.0.0',
            description: 'Test',
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
        }),
      };
      expect(adapter.platform).toBe('codex');
      expect(adapter.markerDir).toBe('.agents');
    });

    test('discover returns DiscoveredPlugin array', async () => {
      const adapter: SourceAdapter = {
        platform: 'codex',
        markerDir: '.agents',
        discover: async () => [
          {
            name: 'test-plugin',
            path: '/test/path',
            markerPath: '/test/path/.agents',
          },
        ],
        parse: async () => ({} as PluginIR),
      };
      const result = await adapter.discover('/repo');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('test-plugin');
    });
  });

  describe('PluginIR', () => {
    test('has correct source structure with repoUrl, pluginPath, commitSha, version', () => {
      const ir: PluginIR = {
        id: 'test-plugin',
        source: {
          platform: 'codex',
          repoUrl: 'https://github.com/user/repo',
          pluginPath: '/plugins/test',
          commitSha: 'abc123def456',
          version: '1.2.3',
        },
        manifest: {
          name: 'Test Plugin',
          version: '1.2.3',
          description: 'A test plugin',
          author: { name: 'Test Author' },
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
      expect(ir.source.repoUrl).toBe('https://github.com/user/repo');
      expect(ir.source.pluginPath).toBe('/plugins/test');
      expect(ir.source.commitSha).toBe('abc123def456');
      expect(ir.source.version).toBe('1.2.3');
    });

    test('manifest has required name, version, description, author fields', () => {
      const manifest: ManifestInfo = {
        name: 'Test Plugin',
        version: '1.0.0',
        description: 'A test plugin',
        author: {
          name: 'John Doe',
          email: 'john@example.com',
          url: 'https://example.com',
        },
        raw: { original: 'data' },
      };
      expect(manifest.name).toBe('Test Plugin');
      expect(manifest.author.name).toBe('John Doe');
      expect(manifest.author.email).toBe('john@example.com');
    });

    test('manifest supports optional fields', () => {
      const manifest: ManifestInfo = {
        name: 'Test',
        version: '1.0.0',
        description: 'Test',
        author: { name: 'Test' },
        displayName: 'Test Plugin Display',
        license: 'MIT',
        homepage: 'https://test.com',
        repository: 'https://github.com/test/test',
        keywords: ['test', 'plugin'],
        category: 'utility',
        logo: 'https://test.com/logo.png',
        raw: {},
      };
      expect(manifest.displayName).toBe('Test Plugin Display');
      expect(manifest.keywords).toContain('test');
    });
  });

  describe('Components', () => {
    test('SkillRef has name, path, hasScripts', () => {
      const skill: SkillRef = {
        name: 'test-skill',
        path: '/skills/test.md',
        hasScripts: true,
      };
      expect(skill.hasScripts).toBe(true);
    });

    test('HookRef has configPath, events, format', () => {
      const hook: HookRef = {
        configPath: '/hooks/config.json',
        events: ['pre-commit', 'post-merge'],
        format: 'codex',
      };
      expect(hook.events).toContain('pre-commit');
      expect(hook.format).toBe('codex');
    });

    test('AgentRef has name, path, format', () => {
      const agent: AgentRef = {
        name: 'test-agent',
        path: '/agents/test.md',
        format: 'claude-md',
      };
      expect(agent.format).toBe('claude-md');
    });

    test('CommandRef has name and path', () => {
      const cmd: CommandRef = {
        name: 'test-cmd',
        path: '/commands/test.sh',
      };
      expect(cmd.name).toBe('test-cmd');
    });

    test('McpRef has configPath and servers array', () => {
      const mcp: McpRef = {
        configPath: '/mcp/config.json',
        servers: [
          {
            name: 'test-server',
            transport: 'stdio',
          },
        ],
      };
      expect(mcp.servers).toHaveLength(1);
      expect(mcp.servers[0].transport).toBe('stdio');
    });

    test('RuleRef has path, alwaysApply, optional globs', () => {
      const rule: RuleRef = {
        path: '/rules/test.md',
        alwaysApply: false,
        globs: ['**/*.ts', '**/*.tsx'],
      };
      expect(rule.alwaysApply).toBe(false);
      expect(rule.globs).toContain('**/*.ts');
    });

    test('AppRef has configPath and description', () => {
      const app: AppRef = {
        configPath: '/apps/config.json',
        description: 'Test app',
      };
      expect(app.description).toBe('Test app');
    });
  });

  describe('Compatibility', () => {
    test('has overall level and details array', () => {
      const compat: Compatibility = {
        overall: 'partial',
        details: [
          {
            type: 'skill',
            name: 'test-skill',
            level: 'full',
            notes: 'Fully compatible',
          },
        ],
        warnings: ['Some warning'],
        droppedComponents: [],
      };
      expect(compat.overall).toBe('partial');
      expect(compat.details).toHaveLength(1);
      expect(compat.warnings).toContain('Some warning');
    });

    test('ComponentCompat has type, name, level, notes', () => {
      const detail: ComponentCompat = {
        type: 'hook',
        name: 'pre-commit',
        level: 'degraded',
        notes: 'Limited support',
      };
      expect(detail.type).toBe('hook');
      expect(detail.level).toBe('degraded');
    });

    test('DroppedComponent has type and reason', () => {
      const dropped: DroppedComponent = {
        type: 'agent',
        reason: 'Unsupported format',
      };
      expect(dropped.reason).toBe('Unsupported format');
    });
  });
});

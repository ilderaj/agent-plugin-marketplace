import { describe, expect, test } from 'bun:test';
import { join } from 'path';
import { ClaudeAdapter } from '../../src/adapters/claude';
import { CodexAdapter } from '../../src/adapters/codex';
import { CursorAdapter } from '../../src/adapters/cursor';
import {
  createMarketplaceEntry,
  createMarketplaceEntryFromManifests,
  MarketplaceGenerator,
  type OfficialPluginManifest,
  type MetaPluginManifest,
} from '../../src/generator/marketplace';

const FIXTURES_DIR = join(import.meta.dir, '../fixtures');

describe('MarketplaceGenerator', () => {
  test('generates stable marketplace JSON using normalized plugin names with enriched fields', async () => {
    const [cursorIr, claudeIr, codexIr] = await Promise.all([
      new CursorAdapter().parse(join(FIXTURES_DIR, 'cursor-continual-learning')),
      new ClaudeAdapter().parse(join(FIXTURES_DIR, 'claude-code-review')),
      new CodexAdapter().parse(join(FIXTURES_DIR, 'codex-github')),
    ]);

    const result = new MarketplaceGenerator({
      name: 'agent-plugin-marketplace',
      owner: {
        name: 'your-org',
        email: 'plugins@example.com',
      },
      metadata: {
        description: 'Cross-platform agent plugins converted for VS Code',
      },
    }).generate([cursorIr, claudeIr, codexIr]);

    expect(result.name).toBe('agent-plugin-marketplace');
    expect(result.owner).toEqual({
      name: 'your-org',
      email: 'plugins@example.com',
    });
    expect(result.metadata.description).toBe('Cross-platform agent plugins converted for VS Code');
    expect(result.plugins).toHaveLength(3);

    // All entries must have strict: false
    for (const plugin of result.plugins) {
      expect(plugin.strict).toBe(false);
    }

    // Entries sorted by name
    expect(result.plugins[0].name).toBe('claude--code-review');
    expect(result.plugins[1].name).toBe('codex--github');
    expect(result.plugins[2].name).toBe('cursor--continual-learning');

    // Check enriched fields on a specific entry
    const claudeEntry = result.plugins[0];
    expect(claudeEntry.source).toBe('plugins/claude--code-review');
    expect(claudeEntry.description).toBe('Automated code review assistant for Claude Code (from Claude Code)');
    expect(claudeEntry.version).toBe('2.1.0');
    expect(claudeEntry.author).toEqual({ name: 'Anthropic', email: 'support@anthropic.com' });
  });

  test('createMarketplaceEntry populates enriched fields from IR', async () => {
    const ir = await new CodexAdapter().parse(join(FIXTURES_DIR, 'codex-github'));
    const entry = createMarketplaceEntry(ir);

    expect(entry.name).toBe('codex--github');
    expect(entry.source).toBe('plugins/codex--github');
    expect(entry.description).toBe('GitHub integration plugin for Codex (from Codex)');
    expect(entry.version).toBe('1.0.0');
    expect(entry.author).toEqual({ name: 'OpenAI', email: 'support@openai.com', url: 'https://openai.com' });
    expect(entry.strict).toBe(false);
  });

  test('createMarketplaceEntryFromManifests builds entry from official + meta manifests', () => {
    const official: OfficialPluginManifest = {
      name: 'codex--github',
      version: '1.0.0',
      description: 'GitHub integration plugin for Codex',
      author: { name: 'OpenAI', email: 'support@openai.com' },
      keywords: ['github', 'codex'],
      strict: false,
    };

    const meta: MetaPluginManifest = {
      displayName: 'GitHub (from Codex)',
      _source: {
        platform: 'codex',
        upstream: 'https://github.com/openai/codex.git',
        pluginPath: '/tmp/codex-github',
        commitSha: 'abc123',
        version: '1.0.0',
      },
      _compatibility: {
        overall: 'partial',
        notes: [],
        warnings: [],
        droppedComponents: [],
      },
    };

    const entry = createMarketplaceEntryFromManifests(official, meta);

    expect(entry.name).toBe('codex--github');
    expect(entry.source).toBe('plugins/codex--github');
    expect(entry.description).toBe('GitHub integration plugin for Codex (from Codex)');
    expect(entry.version).toBe('1.0.0');
    expect(entry.author).toEqual({ name: 'OpenAI', email: 'support@openai.com' });
    expect(entry.keywords).toEqual(['github', 'codex']);
    expect(entry.strict).toBe(false);
  });
});

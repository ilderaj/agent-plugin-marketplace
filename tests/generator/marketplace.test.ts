import { describe, expect, test } from 'bun:test';
import { join } from 'path';
import { ClaudeAdapter } from '../../src/adapters/claude';
import { CodexAdapter } from '../../src/adapters/codex';
import { CursorAdapter } from '../../src/adapters/cursor';
import { MarketplaceGenerator } from '../../src/generator/marketplace';

const FIXTURES_DIR = join(import.meta.dir, '../fixtures');

describe('MarketplaceGenerator', () => {
  test('generates stable marketplace JSON using normalized plugin names', async () => {
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
    expect(result.plugins).toEqual([
      {
        name: 'claude--code-review',
        source: 'plugins/claude--code-review',
        description: 'Automated code review assistant for Claude Code (from Claude Code)',
      },
      {
        name: 'codex--github',
        source: 'plugins/codex--github',
        description: 'GitHub integration plugin for Codex (from Codex)',
      },
      {
        name: 'cursor--continual-learning',
        source: 'plugins/cursor--continual-learning',
        description: 'Continual learning and knowledge accumulation for Cursor (from Cursor)',
      },
    ]);
  });
});

/**
 * Smoke tests: verify generated output can be consumed by `copilot plugin marketplace` commands.
 * Skipped when SKIP_SMOKE_TESTS=1 or when the `copilot` CLI is not available.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { cp, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const REPO_ROOT = join(import.meta.dir, '../..');
const PLUGINS_DIR = join(REPO_ROOT, 'plugins');
const GITHUB_MARKETPLACE = join(REPO_ROOT, '.github', 'plugin', 'marketplace.json');
const SMOKE_ROOT = join(import.meta.dir, '../.generated/smoke');

async function isCopilotAvailable(): Promise<boolean> {
  try {
    const proc = Bun.spawn({ cmd: ['copilot', '--version'], stderr: 'pipe', stdout: 'pipe' });
    const code = await proc.exited;
    return code === 0;
  } catch {
    return false;
  }
}

async function runCopilot(args: string[], env?: Record<string, string>): Promise<{ stdout: string; stderr: string; code: number }> {
  const proc = Bun.spawn({
    cmd: ['copilot', ...args],
    env: { ...process.env, ...env },
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, code };
}

const SKIP = process.env.SKIP_SMOKE_TESTS === '1';

// Check at module level so we can skip the whole suite early.
let copilotAvailable = false;

beforeAll(async () => {
  if (SKIP) return;
  copilotAvailable = await isCopilotAvailable();
  if (!copilotAvailable) return;

  // Verify that generated artifacts exist before running smoke tests
  if (!existsSync(PLUGINS_DIR) || !existsSync(GITHUB_MARKETPLACE)) {
    copilotAvailable = false;
    return;
  }

  await mkdir(SMOKE_ROOT, { recursive: true });
});

afterAll(async () => {
  await rm(SMOKE_ROOT, { recursive: true, force: true });
});

describe('Copilot CLI marketplace smoke tests', () => {
  test('copilot plugin marketplace add/list/browse/remove round-trip', async () => {
    if (SKIP || !copilotAvailable) {
      console.log('Skipping smoke test: copilot CLI unavailable or SKIP_SMOKE_TESTS=1');
      return;
    }

    // Prepare a local marketplace directory layout that copilot can consume.
    const localMarketplace = join(SMOKE_ROOT, 'local-marketplace');
    await mkdir(join(localMarketplace, '.github', 'plugin'), { recursive: true });
    await cp(PLUGINS_DIR, join(localMarketplace, 'plugins'), { recursive: true });
    await cp(GITHUB_MARKETPLACE, join(localMarketplace, '.github', 'plugin', 'marketplace.json'));

    const testHome = join(SMOKE_ROOT, 'home');
    await mkdir(testHome, { recursive: true });

    const env = { HOME: testHome, XDG_CONFIG_HOME: join(testHome, '.config') };

    // Add local marketplace
    const addResult = await runCopilot(['plugin', 'marketplace', 'add', localMarketplace], env);
    expect(addResult.code).toBe(0);

    // List should show the marketplace
    const listResult = await runCopilot(['plugin', 'marketplace', 'list'], env);
    expect(listResult.code).toBe(0);
    expect(listResult.stdout).toContain('agent-plugin-marketplace');

    // Browse the marketplace
    const browseResult = await runCopilot(['plugin', 'marketplace', 'browse', 'agent-plugin-marketplace'], env);
    expect(browseResult.code).toBe(0);

    // Remove the marketplace
    const removeResult = await runCopilot(['plugin', 'marketplace', 'remove', 'agent-plugin-marketplace'], env);
    expect(removeResult.code).toBe(0);
  });
});

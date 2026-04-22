/**
 * Smoke tests: verify generated output can be consumed by `copilot plugin marketplace` commands.
 * Skipped when SKIP_SMOKE_TESTS=1 or when the `copilot` CLI is not available.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { cp, mkdir, readFile, readdir, rm } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const REPO_ROOT = join(import.meta.dir, '../..');
const PLUGINS_DIR = join(REPO_ROOT, 'plugins');
const GITHUB_MARKETPLACE = join(REPO_ROOT, '.github', 'plugin', 'marketplace.json');
const SMOKE_ROOT = join(import.meta.dir, '../.generated/smoke');
const SMOKE_TIMEOUT_MS = 15_000;
const REPRESENTATIVE_PLUGINS = ['codex--build-ios-apps', 'codex--figma', 'claude--hookify'] as const;
const INSTALL_OUTPUT_PATTERN = /Installed \d+ skills?\./;
const MANIFEST_ARTIFACTS = [
  { key: 'skills', fallbackPath: 'skills' },
  { key: 'agents', fallbackPath: 'agents' },
  { key: 'commands', fallbackPath: 'commands' },
  { key: 'mcpServers', fallbackPath: '.mcp.json' },
  { key: 'hooks', fallbackPath: 'hooks/hooks.json' },
] as const;

type PluginManifest = {
  name: string;
  skills?: string;
  agents?: string;
  commands?: string;
  hooks?: string;
  mcpServers?: string;
};

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

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

function normalizeManifestPath(path: string): string {
  return path.replace(/^[.][/\\]/, '').replace(/[\\/]+$/, '');
}

function getInstalledPluginDir(testHome: string, pluginName: string) {
  return join(testHome, '.copilot', 'installed-plugins', 'agent-plugin-marketplace', pluginName);
}

async function prepareSmokeContext(name: string) {
  const root = join(SMOKE_ROOT, name);
  const localMarketplace = join(root, 'local-marketplace');
  const testHome = join(root, 'home');

  await rm(root, { recursive: true, force: true });
  await mkdir(join(localMarketplace, '.github', 'plugin'), { recursive: true });
  await cp(PLUGINS_DIR, join(localMarketplace, 'plugins'), { recursive: true });
  await cp(GITHUB_MARKETPLACE, join(localMarketplace, '.github', 'plugin', 'marketplace.json'));
  await mkdir(testHome, { recursive: true });

  return {
    env: { HOME: testHome, XDG_CONFIG_HOME: join(testHome, '.config') },
    localMarketplace,
    testHome,
  };
}

async function addLocalMarketplace(localMarketplace: string, env: Record<string, string>) {
  const addResult = await runCopilot(['plugin', 'marketplace', 'add', localMarketplace], env);
  assertCopilotSuccess('plugin marketplace add', addResult);
}

async function assertInstalledPluginArtifacts(testHome: string, pluginName: string) {
  const sourceManifest = await readJson<PluginManifest>(join(PLUGINS_DIR, pluginName, 'plugin.json'));
  const installedPluginDir = getInstalledPluginDir(testHome, pluginName);
  const installedManifestPath = join(installedPluginDir, 'plugin.json');

  expect(existsSync(installedPluginDir)).toBe(true);
  expect(existsSync(installedManifestPath)).toBe(true);

  const installedManifest = await readJson<PluginManifest>(installedManifestPath);
  expect(installedManifest).toEqual(sourceManifest);

  for (const artifact of MANIFEST_ARTIFACTS) {
    const manifestPath = sourceManifest[artifact.key];
    const relativePath = manifestPath ? normalizeManifestPath(manifestPath) : artifact.fallbackPath;
    expect(existsSync(join(installedPluginDir, relativePath))).toBe(Boolean(manifestPath));
  }

  const nestedAgentYaml = Array.from(new Bun.Glob('skills/*/agents/*.yaml').scanSync({ cwd: installedPluginDir }));
  expect(nestedAgentYaml).toHaveLength(0);

  const topLevelAgentYaml = Array.from(new Bun.Glob('agents/*.yaml').scanSync({ cwd: installedPluginDir }));
  expect(topLevelAgentYaml).toHaveLength(0);

  const topLevelEntries = await readdir(installedPluginDir);
  expect(topLevelEntries.filter((entry) => entry.endsWith('.yaml'))).toHaveLength(0);
}

function assertCopilotSuccess(
  step: string,
  result: { stdout: string; stderr: string; code: number }
) {
  if (result.code === 0) {
    return;
  }

  const sections = [
    `copilot ${step} failed with exit code ${result.code}`,
    result.stdout ? `stdout:\n${result.stdout.trim()}` : 'stdout: <empty>',
    result.stderr ? `stderr:\n${result.stderr.trim()}` : 'stderr: <empty>',
  ];

  throw new Error(sections.join('\n\n'));
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

    const { env, localMarketplace } = await prepareSmokeContext('round-trip');
    await addLocalMarketplace(localMarketplace, env);

    // List should show the marketplace
    const listResult = await runCopilot(['plugin', 'marketplace', 'list'], env);
    assertCopilotSuccess('plugin marketplace list', listResult);
    expect(listResult.stdout).toContain('agent-plugin-marketplace');

    // Browse the marketplace
    const browseResult = await runCopilot(['plugin', 'marketplace', 'browse', 'agent-plugin-marketplace'], env);
    assertCopilotSuccess('plugin marketplace browse', browseResult);

    // Remove the marketplace
    const removeResult = await runCopilot(['plugin', 'marketplace', 'remove', 'agent-plugin-marketplace'], env);
    assertCopilotSuccess('plugin marketplace remove', removeResult);
  }, SMOKE_TIMEOUT_MS);

  for (const pluginName of REPRESENTATIVE_PLUGINS) {
    test(`copilot plugin install ${pluginName} yields manifest-aligned artifacts`, async () => {
      if (SKIP || !copilotAvailable) {
        console.log('Skipping smoke test: copilot CLI unavailable or SKIP_SMOKE_TESTS=1');
        return;
      }

      const { env, localMarketplace, testHome } = await prepareSmokeContext(`install-${pluginName}`);
      await addLocalMarketplace(localMarketplace, env);

      const installResult = await runCopilot(['plugin', 'install', `${pluginName}@agent-plugin-marketplace`], env);
      assertCopilotSuccess(`plugin install ${pluginName}@agent-plugin-marketplace`, installResult);
      expect(installResult.stdout).toMatch(INSTALL_OUTPUT_PATTERN);

      await assertInstalledPluginArtifacts(testHome, pluginName);
    }, SMOKE_TIMEOUT_MS);
  }
});

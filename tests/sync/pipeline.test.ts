import { afterEach, beforeEach, describe, expect, mock, setDefaultTimeout, test } from "bun:test";
import { cp, mkdir, readFile, rm, stat, writeFile } from "fs/promises";
import { randomUUID } from "crypto";
import { join } from "path";
import { createDefaultSyncConfig, createPipeline, main } from "../../src/index";
import { CodexAdapter } from "../../src/adapters/codex";
import { MarketplaceGenerator } from "../../src/generator/marketplace";
import { VsCodePluginGenerator } from "../../src/generator/vscode-plugin";
import {
  computeDefaultToolchainFingerprint,
  SyncPipeline,
  type SyncConfig,
} from "../../src/sync/pipeline";
import { SyncStateManager } from "../../src/sync/sync-state";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "codex-github");
const ASC_FIXTURE = join(import.meta.dir, "..", "fixtures", "asc-cli-skills");
const GENERATED_ROOT = join(import.meta.dir, "..", ".generated", "sync-pipeline");

let workspaceDir: string;

setDefaultTimeout(15_000);

async function createWorkspace(name: string): Promise<string> {
  await mkdir(GENERATED_ROOT, { recursive: true });
  const dir = join(GENERATED_ROOT, `${name}-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function runGit(args: string[], cwd?: string): Promise<string> {
  const proc = Bun.spawn({
    cmd: ["git", ...args],
    cwd,
    stderr: "pipe",
    stdout: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() || `git ${args.join(" ")} failed`);
  }

  return stdout.trim();
}

async function createLocalUpstream() {
  const upstreamRoot = join(workspaceDir, "upstream");
  const bareRepo = join(upstreamRoot, "origin.git");
  const sourceRepo = join(upstreamRoot, "source");
  const pluginDir = join(sourceRepo, "plugins", "codex-github");

  await mkdir(upstreamRoot, { recursive: true });
  await runGit(["init", "--bare", bareRepo]);
  await runGit(["init", sourceRepo]);
  await runGit(["config", "user.name", "Test User"], sourceRepo);
  await runGit(["config", "user.email", "test@example.com"], sourceRepo);
  await cp(FIXTURE, pluginDir, { recursive: true });
  await runGit(["add", "."], sourceRepo);
  await runGit(["commit", "-m", "Initial plugin"], sourceRepo);
  await runGit(["remote", "add", "origin", bareRepo], sourceRepo);
  await runGit(["push", "-u", "origin", "HEAD"], sourceRepo);

  return {
    bareRepoUrl: `file://${bareRepo}`,
    sourceRepo,
    pluginDir,
  };
}

async function createLocalAscUpstream() {
  const upstreamRoot = join(workspaceDir, "asc-upstream");
  const bareRepo = join(upstreamRoot, "origin.git");
  const sourceRepo = join(upstreamRoot, "source");

  await mkdir(upstreamRoot, { recursive: true });
  await runGit(["init", "--bare", bareRepo]);
  await runGit(["init", sourceRepo]);
  await runGit(["config", "user.name", "Test User"], sourceRepo);
  await runGit(["config", "user.email", "test@example.com"], sourceRepo);
  await cp(ASC_FIXTURE, sourceRepo, { recursive: true });
  await runGit(["add", "."], sourceRepo);
  await runGit(["commit", "-m", "Initial asc skill pack"], sourceRepo);
  await runGit(["remote", "add", "origin", bareRepo], sourceRepo);
  await runGit(["push", "-u", "origin", "HEAD"], sourceRepo);

  return {
    bareRepoUrl: `file://${bareRepo}`,
    sourceRepo,
  };
}

function createConfig(repoUrl: string, toolchainFingerprint = "toolchain-v1"): SyncConfig {
  return {
    cacheDir: join(workspaceDir, "cache"),
    outputDir: join(workspaceDir, "output"),
    toolchainFingerprint,
    repoUrls: {
      codex: repoUrl,
    },
    marketplace: {
      name: "agent-plugin-marketplace",
      owner: {
        name: "test-owner",
      },
      metadata: {
        description: "Cross-platform agent plugins converted for VS Code",
      },
    },
  };
}

function createConfigWithoutFingerprint(repoUrl: string): SyncConfig {
  const config = createConfig(repoUrl);
  delete config.toolchainFingerprint;
  return config;
}

beforeEach(async () => {
  workspaceDir = await createWorkspace("workspace");
});

afterEach(async () => {
  await rm(workspaceDir, { recursive: true, force: true });
  mock.restore();
});

describe("SyncPipeline", () => {
  test("computeDefaultToolchainFingerprint only hashes output-affecting runtime files", async () => {
    const runtimeRoot = join(workspaceDir, "runtime-root");
    const writeRuntimeFile = (relativePath: string, content: string) =>
      writeFile(join(runtimeRoot, relativePath), content, "utf-8");

    await mkdir(join(runtimeRoot, "adapters"), { recursive: true });
    await mkdir(join(runtimeRoot, "generator"), { recursive: true });
    await mkdir(join(runtimeRoot, "sync"), { recursive: true });
    await mkdir(join(runtimeRoot, "utils"), { recursive: true });

    await Promise.all([
      writeRuntimeFile("adapters/codex.ts", "export const codex = 'v1';\n"),
      writeRuntimeFile("adapters/types.ts", "export type Platform = 'codex';\n"),
      writeRuntimeFile("generator/vscode-plugin.ts", "export const generated = true;\n"),
      writeRuntimeFile("generator/marketplace.ts", "export const marketplace = true;\n"),
      writeRuntimeFile("sync/pipeline.ts", "export const pipeline = true;\n"),
      writeRuntimeFile("sync/sync-state.ts", "export const state = true;\n"),
      writeRuntimeFile("utils/git.ts", "export const gitRuntime = 'v1';\n"),
      writeRuntimeFile("sync/report-formatter.ts", "export const ignored = 'initial';\n"),
      writeRuntimeFile("adapters/types.test.ts", "export const ignoredTest = 'initial';\n"),
    ]);

    const initialFingerprint = computeDefaultToolchainFingerprint(runtimeRoot);
    expect(initialFingerprint).toMatch(/^[0-9a-f]{64}$/);

    await writeRuntimeFile("sync/report-formatter.ts", "export const ignored = 'changed';\n");
    await writeRuntimeFile("adapters/types.test.ts", "export const ignoredTest = 'changed';\n");
    expect(computeDefaultToolchainFingerprint(runtimeRoot)).toBe(initialFingerprint);

    await writeRuntimeFile("utils/git.ts", "export const gitRuntime = 'v2';\n");
    expect(computeDefaultToolchainFingerprint(runtimeRoot)).not.toBe(initialFingerprint);
  });

  test("run clones upstream, generates outputs, persists state, and pulls later updates", async () => {
    const upstream = await createLocalUpstream();
    const stateFile = join(workspaceDir, "data", "sync-state.json");
    const pipeline = new SyncPipeline({
      adapters: [new CodexAdapter()],
      generator: new VsCodePluginGenerator(),
      marketplaceGen: new MarketplaceGenerator(createConfig(upstream.bareRepoUrl).marketplace),
      stateManager: new SyncStateManager(stateFile),
      config: createConfig(upstream.bareRepoUrl),
    });

    const firstReport = await pipeline.run();
    expect(firstReport).toEqual({
      updated: 1,
      total: 1,
      added: [{ name: "codex-github", platform: "codex" }],
      removed: [],
      changed: [],
    });

    const generatedPluginDir = join(workspaceDir, "output", "plugins", "codex--github");
    // _source now lives in _meta.json
    const generatedMeta = JSON.parse(
      await readFile(join(generatedPluginDir, "_meta.json"), "utf-8"),
    ) as { _source: { upstream: string; commitSha: string } };
    expect(generatedMeta._source.upstream).toBe(upstream.bareRepoUrl);
    expect(generatedMeta._source.commitSha).toMatch(/^[0-9a-f]{40}$/);

    // plugin.json must have strict: false and no _source
    const generatedManifest = JSON.parse(
      await readFile(join(generatedPluginDir, "plugin.json"), "utf-8"),
    ) as { strict: boolean; _source?: unknown };
    expect(generatedManifest.strict).toBe(false);
    expect(generatedManifest._source).toBeUndefined();

    const stateAfterFirstRun = JSON.parse(await readFile(stateFile, "utf-8")) as {
      sources: Record<string, { repoUrl: string; lastCommit: string; plugins: Record<string, { commitSha: string }> }>;
    };
    expect(stateAfterFirstRun.sources.codex?.repoUrl).toBe(upstream.bareRepoUrl);
    expect(stateAfterFirstRun.sources.codex?.lastCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(stateAfterFirstRun.sources.codex?.plugins["codex-github"]?.commitSha).toBe(
      generatedMeta._source.commitSha,
    );

    await mkdir(join(generatedPluginDir, "agents"), { recursive: true });
    await writeFile(join(generatedPluginDir, "agents", "openai.yaml"), "stale private agent\n", "utf-8");
    await writeFile(join(generatedPluginDir, "agents", "orphan.md"), "stale generated agent\n", "utf-8");

    await writeFile(join(upstream.pluginDir, "README.md"), "# Updated plugin\n", "utf-8");
    await runGit(["add", "plugins/codex-github/README.md"], upstream.sourceRepo);
    await runGit(["commit", "-m", "Update plugin"], upstream.sourceRepo);
    const updatedHead = await runGit(["rev-parse", "HEAD"], upstream.sourceRepo);
    await runGit(["push", "origin", "HEAD"], upstream.sourceRepo);

    const secondReport = await pipeline.run();
    expect(secondReport).toEqual({
      updated: 1,
      total: 1,
      added: [],
      removed: [],
      changed: [{ name: "codex-github", platform: "codex" }],
    });

    const regeneratedMeta = JSON.parse(
      await readFile(join(generatedPluginDir, "_meta.json"), "utf-8"),
    ) as { _source: { commitSha: string } };
    expect(regeneratedMeta._source.commitSha).toBe(updatedHead);
    await expect(stat(join(generatedPluginDir, "agents", "openai.yaml"))).rejects.toThrow();
    await expect(stat(join(generatedPluginDir, "agents", "orphan.md"))).rejects.toThrow();

    const marketplace = JSON.parse(
      await readFile(join(workspaceDir, "output", "marketplace.json"), "utf-8"),
    ) as { plugins: Array<{ name: string; source: string; strict: boolean }> };
    expect(marketplace.plugins).toEqual([
      {
        name: "codex--github",
        source: "./plugins/codex--github",
        description: "GitHub integration plugin for Codex (from Codex)",
        version: "1.0.0",
        author: { name: "OpenAI", email: "support@openai.com", url: "https://openai.com" },
        tags: ["github", "vcs", "code-review"],
        strict: false,
      },
    ]);

    // Triple-write: .github/plugin/marketplace.json and .claude-plugin/marketplace.json must match root marketplace.json
    const githubMarketplace = JSON.parse(
      await readFile(join(workspaceDir, "output", ".github", "plugin", "marketplace.json"), "utf-8"),
    ) as object;
    expect(githubMarketplace).toEqual(
      JSON.parse(await readFile(join(workspaceDir, "output", "marketplace.json"), "utf-8")),
    );

    const claudeMarketplace = JSON.parse(
      await readFile(join(workspaceDir, "output", ".claude-plugin", "marketplace.json"), "utf-8"),
    ) as object;
    expect(claudeMarketplace).toEqual(
      JSON.parse(await readFile(join(workspaceDir, "output", "marketplace.json"), "utf-8")),
    );
  });

  test("createPipeline syncs the asc skills upstream into marketplace outputs", async () => {
    const upstream = await createLocalAscUpstream();
    const originals = {
      codex: Bun.env.CODEX_REPO_URL,
      claude: Bun.env.CLAUDE_CODE_REPO_URL,
      cursor: Bun.env.CURSOR_REPO_URL,
      asc: Bun.env.ASC_SKILLS_REPO_URL,
    };

    Bun.env.CODEX_REPO_URL = upstream.bareRepoUrl;
    Bun.env.CLAUDE_CODE_REPO_URL = upstream.bareRepoUrl;
    Bun.env.CURSOR_REPO_URL = upstream.bareRepoUrl;
    Bun.env.ASC_SKILLS_REPO_URL = upstream.bareRepoUrl;

    try {
      const pipeline = createPipeline(createDefaultSyncConfig(workspaceDir));
      const report = await pipeline.run();

      expect(report).toEqual({
        updated: 1,
        total: 1,
        added: [{ name: "asc-cli-skills", platform: "community" }],
        removed: [],
        changed: [],
      });

      const pluginJson = JSON.parse(
        await readFile(
          join(workspaceDir, "plugins", "community--asc-cli-skills", "plugin.json"),
          "utf-8",
        ),
      );

      expect(pluginJson.name).toBe("community--asc-cli-skills");
      expect(pluginJson.skills).toBe("./skills/");
    } finally {
      const entries = [
        ["CODEX_REPO_URL", originals.codex],
        ["CLAUDE_CODE_REPO_URL", originals.claude],
        ["CURSOR_REPO_URL", originals.cursor],
        ["ASC_SKILLS_REPO_URL", originals.asc],
      ] as const;

      for (const [key, value] of entries) {
        if (value === undefined) {
          delete Bun.env[key];
        } else {
          Bun.env[key] = value;
        }
      }
    }
  });

  test("run keeps marketplace complete when nothing changed on the second sync", async () => {
    const upstream = await createLocalUpstream();
    const stateFile = join(workspaceDir, "data", "sync-state.json");
    const config = createConfig(upstream.bareRepoUrl);
    const pipeline = new SyncPipeline({
      adapters: [new CodexAdapter()],
      generator: new VsCodePluginGenerator(),
      marketplaceGen: new MarketplaceGenerator(config.marketplace),
      stateManager: new SyncStateManager(stateFile),
      config,
    });

    await pipeline.run();
    const secondReport = await pipeline.run();

    expect(secondReport).toEqual({ updated: 0, total: 1, added: [], removed: [], changed: [] });
    await expect(readFile(join(workspaceDir, "output", "plugins", "codex--github", "plugin.json"), "utf-8")).resolves.toContain(
      '"name": "codex--github"',
    );

    const marketplace = JSON.parse(
      await readFile(join(workspaceDir, "output", "marketplace.json"), "utf-8"),
    ) as { plugins: Array<{ name: string }> };
    expect(marketplace.plugins).toEqual([
      {
        name: "codex--github",
        source: "./plugins/codex--github",
        description: "GitHub integration plugin for Codex (from Codex)",
        version: "1.0.0",
        author: { name: "OpenAI", email: "support@openai.com", url: "https://openai.com" },
        tags: ["github", "vcs", "code-review"],
        strict: false,
      },
    ]);
  });

  test("run skips parse for unchanged plugins and still keeps marketplace complete", async () => {
    const upstream = await createLocalUpstream();
    const stateFile = join(workspaceDir, "data", "sync-state.json");
    const config = createConfig(upstream.bareRepoUrl);

    await new SyncPipeline({
      adapters: [new CodexAdapter()],
      generator: new VsCodePluginGenerator(),
      marketplaceGen: new MarketplaceGenerator(config.marketplace),
      stateManager: new SyncStateManager(stateFile),
      config,
    }).run();

    const parseCalls: string[] = [];
    const spyAdapter = {
      platform: "codex" as const,
      markerDir: ".codex-plugin",
      discover(repoPath: string) {
        return new CodexAdapter().discover(repoPath);
      },
      async parse(pluginPath: string) {
        parseCalls.push(pluginPath);
        throw new Error("parse should not be called for unchanged plugins");
      },
    };

    const secondReport = await new SyncPipeline({
      adapters: [spyAdapter],
      generator: new VsCodePluginGenerator(),
      marketplaceGen: new MarketplaceGenerator(config.marketplace),
      stateManager: new SyncStateManager(stateFile),
      config,
    }).run();

    expect(secondReport).toEqual({ updated: 0, total: 1, added: [], removed: [], changed: [] });
    expect(parseCalls).toHaveLength(0);
    await expect(readFile(join(workspaceDir, "output", "marketplace.json"), "utf-8")).resolves.toContain(
      '"name": "codex--github"',
    );
  });

  test("run regenerates unchanged plugins when the toolchain fingerprint changes", async () => {
    const upstream = await createLocalUpstream();
    const stateFile = join(workspaceDir, "data", "sync-state.json");

    await new SyncPipeline({
      adapters: [new CodexAdapter()],
      generator: new VsCodePluginGenerator(),
      marketplaceGen: new MarketplaceGenerator(createConfig(upstream.bareRepoUrl, "toolchain-v1").marketplace),
      stateManager: new SyncStateManager(stateFile),
      config: createConfig(upstream.bareRepoUrl, "toolchain-v1"),
    }).run();

    const parseCalls: string[] = [];
    const spyAdapter = {
      platform: "codex" as const,
      markerDir: ".codex-plugin",
      discover(repoPath: string) {
        return new CodexAdapter().discover(repoPath);
      },
      async parse(pluginPath: string) {
        parseCalls.push(pluginPath);
        return new CodexAdapter().parse(pluginPath);
      },
    };

    const secondReport = await new SyncPipeline({
      adapters: [spyAdapter],
      generator: new VsCodePluginGenerator(),
      marketplaceGen: new MarketplaceGenerator(createConfig(upstream.bareRepoUrl, "toolchain-v2").marketplace),
      stateManager: new SyncStateManager(stateFile),
      config: createConfig(upstream.bareRepoUrl, "toolchain-v2"),
    }).run();

    expect(secondReport).toEqual({
      updated: 1,
      total: 1,
      added: [],
      removed: [],
      changed: [{ name: "codex-github", platform: "codex" }],
    });
    expect(parseCalls).toHaveLength(1);

    const stateAfterSecondRun = JSON.parse(await readFile(stateFile, "utf-8")) as {
      toolchainFingerprint?: string;
    };
    expect(stateAfterSecondRun.toolchainFingerprint).toBe("toolchain-v2");
  });

  test("run regenerates plugins from legacy state files without a stored toolchain fingerprint", async () => {
    const upstream = await createLocalUpstream();
    const stateFile = join(workspaceDir, "data", "sync-state.json");
    const config = createConfig(upstream.bareRepoUrl, "toolchain-v1");

    await new SyncPipeline({
      adapters: [new CodexAdapter()],
      generator: new VsCodePluginGenerator(),
      marketplaceGen: new MarketplaceGenerator(config.marketplace),
      stateManager: new SyncStateManager(stateFile),
      config,
    }).run();

    const currentState = JSON.parse(await readFile(stateFile, "utf-8")) as {
      lastSyncAt: string;
      toolchainFingerprint?: string;
      sources: object;
    };
    delete currentState.toolchainFingerprint;
    await writeFile(stateFile, `${JSON.stringify(currentState, null, 2)}\n`, "utf-8");

    const parseCalls: string[] = [];
    const spyAdapter = {
      platform: "codex" as const,
      markerDir: ".codex-plugin",
      discover(repoPath: string) {
        return new CodexAdapter().discover(repoPath);
      },
      async parse(pluginPath: string) {
        parseCalls.push(pluginPath);
        return new CodexAdapter().parse(pluginPath);
      },
    };

    const secondReport = await new SyncPipeline({
      adapters: [spyAdapter],
      generator: new VsCodePluginGenerator(),
      marketplaceGen: new MarketplaceGenerator(config.marketplace),
      stateManager: new SyncStateManager(stateFile),
      config,
    }).run();

    expect(secondReport).toEqual({
      updated: 1,
      total: 1,
      added: [],
      removed: [],
      changed: [{ name: "codex-github", platform: "codex" }],
    });
    expect(parseCalls).toHaveLength(1);

    const upgradedState = JSON.parse(await readFile(stateFile, "utf-8")) as {
      toolchainFingerprint?: string;
    };
    expect(upgradedState.toolchainFingerprint).toBe("toolchain-v1");

    const thirdParseCalls: string[] = [];
    const thirdReport = await new SyncPipeline({
      adapters: [
        {
          platform: "codex" as const,
          markerDir: ".codex-plugin",
          discover(repoPath: string) {
            return new CodexAdapter().discover(repoPath);
          },
          async parse(pluginPath: string) {
            thirdParseCalls.push(pluginPath);
            throw new Error("parse should not run after legacy state is upgraded");
          },
        },
      ],
      generator: new VsCodePluginGenerator(),
      marketplaceGen: new MarketplaceGenerator(config.marketplace),
      stateManager: new SyncStateManager(stateFile),
      config,
    }).run();

    expect(thirdReport).toEqual({ updated: 0, total: 1, added: [], removed: [], changed: [] });
    expect(thirdParseCalls).toHaveLength(0);
  });

  test("run computes and persists a stable default toolchain fingerprint when config omits one", async () => {
    const upstream = await createLocalUpstream();
    const stateFile = join(workspaceDir, "data", "sync-state.json");
    const config = createConfigWithoutFingerprint(upstream.bareRepoUrl);
    const makePipeline = () =>
      new SyncPipeline({
        adapters: [new CodexAdapter()],
        generator: new VsCodePluginGenerator(),
        marketplaceGen: new MarketplaceGenerator(config.marketplace),
        stateManager: new SyncStateManager(stateFile),
        config,
      });

    const firstReport = await makePipeline().run();
    expect(firstReport.updated).toBe(1);

    const stateAfterFirstRun = JSON.parse(await readFile(stateFile, "utf-8")) as {
      toolchainFingerprint?: string;
    };
    expect(stateAfterFirstRun.toolchainFingerprint).toMatch(/^[0-9a-f]{64}$/);

    const secondReport = await makePipeline().run();
    expect(secondReport).toEqual({ updated: 0, total: 1, added: [], removed: [], changed: [] });

    const stateAfterSecondRun = JSON.parse(await readFile(stateFile, "utf-8")) as {
      toolchainFingerprint?: string;
    };
    expect(stateAfterSecondRun.toolchainFingerprint).toBe(stateAfterFirstRun.toolchainFingerprint);
  });

  test("main executes the sync command and prints the report", async () => {
    const run = mock(async () => ({ updated: 2, total: 3, added: [], removed: [], changed: [] }));
    const log = mock(() => {});

    await main(["sync"], {
      createPipeline: () =>
        ({
          run,
        }) as Pick<SyncPipeline, "run">,
      logger: {
        log,
        error: mock(() => {}),
      },
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("Synced 2/3 plugins");
  });

  test("main logs sync failures before rethrowing", async () => {
    const run = mock(async () => {
      throw new Error("boom");
    });
    const error = mock(() => {});

    await expect(
      main(["sync"], {
        createPipeline: () =>
          ({
            run,
          }) as Pick<SyncPipeline, "run">,
        logger: {
          log: mock(() => {}),
          error,
        },
      }),
    ).rejects.toThrow("boom");

    expect(error).toHaveBeenCalledWith("Sync failed: boom");
  });

  test("enriched report tracks added/changed/removed plugins across runs", async () => {
    const upstream = await createLocalUpstream();
    const stateFile = join(workspaceDir, "data", "sync-state.json");
    const config = createConfig(upstream.bareRepoUrl);
    const makeInstance = () =>
      new SyncPipeline({
        adapters: [new CodexAdapter()],
        generator: new VsCodePluginGenerator(),
        marketplaceGen: new MarketplaceGenerator(config.marketplace),
        stateManager: new SyncStateManager(stateFile),
        config,
      });

    // first run: plugin is new → added
    const first = await makeInstance().run();
    expect(first.added).toEqual([{ name: "codex-github", platform: "codex" }]);
    expect(first.changed).toEqual([]);
    expect(first.removed).toEqual([]);

    // second run: nothing changed → all empty
    const second = await makeInstance().run();
    expect(second.added).toEqual([]);
    expect(second.changed).toEqual([]);
    expect(second.removed).toEqual([]);

    // push an update so the plugin commitSha changes → changed
    await writeFile(join(upstream.pluginDir, "NOTES.md"), "notes\n", "utf-8");
    await runGit(["add", "plugins/codex-github/NOTES.md"], upstream.sourceRepo);
    await runGit(["commit", "-m", "Update notes"], upstream.sourceRepo);
    await runGit(["push", "origin", "HEAD"], upstream.sourceRepo);

    const third = await makeInstance().run();
    expect(third.added).toEqual([]);
    expect(third.changed).toEqual([{ name: "codex-github", platform: "codex" }]);
    expect(third.removed).toEqual([]);
  });

  test("main writes markdown report to SYNC_REPORT_PATH when env var is set", async () => {
    const reportPath = join(workspaceDir, "sync-report.md");
    const originalEnv = Bun.env.SYNC_REPORT_PATH;
    Bun.env.SYNC_REPORT_PATH = reportPath;

    const run = mock(async () => ({
      updated: 1,
      total: 2,
      added: [{ name: "new-plugin", platform: "codex" }],
      removed: [],
      changed: [],
    }));

    try {
      await main(["sync"], {
        createPipeline: () => ({ run }) as Pick<SyncPipeline, "run">,
        logger: { log: mock(() => {}), error: mock(() => {}) },
      });

      const written = await readFile(reportPath, "utf-8");
      expect(written).toContain("## Sync Summary");
      expect(written).toContain("**1 updated** out of 2 total plugins.");
      expect(written).toContain("### Added (1)");
      expect(written).toContain("`new-plugin` (codex)");
    } finally {
      if (originalEnv === undefined) {
        delete Bun.env.SYNC_REPORT_PATH;
      } else {
        Bun.env.SYNC_REPORT_PATH = originalEnv;
      }
    }
  });

  test("removed plugin does not appear in subsequent sync reports after state is cleaned up", async () => {
    const upstream = await createLocalUpstream();
    const stateFile = join(workspaceDir, "data", "sync-state.json");
    const config = createConfig(upstream.bareRepoUrl);
    const makeInstance = () =>
      new SyncPipeline({
        adapters: [new CodexAdapter()],
        generator: new VsCodePluginGenerator(),
        marketplaceGen: new MarketplaceGenerator(config.marketplace),
        stateManager: new SyncStateManager(stateFile),
        config,
      });

    // first run: plugin is discovered and added
    const first = await makeInstance().run();
    expect(first.added).toEqual([{ name: "codex-github", platform: "codex" }]);
    expect(first.removed).toEqual([]);

    // remove the plugin from upstream so it is no longer discovered
    const pluginDir = join(workspaceDir, "upstream", "source", "plugins", "codex-github");
    const sourceRepo = join(workspaceDir, "upstream", "source");
    await runGit(["rm", "-r", "plugins/codex-github"], sourceRepo);
    await runGit(["commit", "-m", "Remove plugin"], sourceRepo);
    await runGit(["push", "origin", "HEAD"], sourceRepo);

    // second run: plugin is detected as removed
    const second = await makeInstance().run();
    expect(second.removed).toEqual([{ name: "codex-github", platform: "codex" }]);

    // third run: plugin is no longer in state, must NOT appear in removed again
    const third = await makeInstance().run();
    expect(third.removed).toEqual([]);
  });

  test("main does not write report file when SYNC_REPORT_PATH is not set", async () => {
    delete Bun.env.SYNC_REPORT_PATH;
    const reportPath = join(workspaceDir, "should-not-exist.md");

    const run = mock(async () => ({
      updated: 0,
      total: 1,
      added: [],
      removed: [],
      changed: [],
    }));

    await main(["sync"], {
      createPipeline: () => ({ run }) as Pick<SyncPipeline, "run">,
      logger: { log: mock(() => {}), error: mock(() => {}) },
    });

    await expect(readFile(reportPath, "utf-8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});

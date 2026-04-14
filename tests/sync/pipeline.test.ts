import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cp, mkdir, readFile, rm, writeFile } from "fs/promises";
import { randomUUID } from "crypto";
import { join } from "path";
import { CodexAdapter } from "../../src/adapters/codex";
import { MarketplaceGenerator } from "../../src/generator/marketplace";
import { VsCodePluginGenerator } from "../../src/generator/vscode-plugin";
import { main } from "../../src/index";
import { SyncPipeline, type SyncConfig } from "../../src/sync/pipeline";
import { SyncStateManager } from "../../src/sync/sync-state";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "codex-github");
const GENERATED_ROOT = join(import.meta.dir, "..", ".generated", "sync-pipeline");

let workspaceDir: string;

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
  const pluginDir = join(sourceRepo, "codex-github");

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

function createConfig(repoUrl: string): SyncConfig {
  return {
    cacheDir: join(workspaceDir, "cache"),
    outputDir: join(workspaceDir, "output"),
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

beforeEach(async () => {
  workspaceDir = await createWorkspace("workspace");
});

afterEach(async () => {
  await rm(workspaceDir, { recursive: true, force: true });
  mock.restore();
});

describe("SyncPipeline", () => {
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
    expect(firstReport).toEqual({ updated: 1, total: 1 });

    const generatedPluginDir = join(workspaceDir, "output", "plugins", "codex--github");
    const generatedManifest = JSON.parse(
      await readFile(join(generatedPluginDir, "plugin.json"), "utf-8"),
    ) as { _source: { upstream: string; commitSha: string } };
    expect(generatedManifest._source.upstream).toBe(upstream.bareRepoUrl);
    expect(generatedManifest._source.commitSha).toMatch(/^[0-9a-f]{40}$/);

    const stateAfterFirstRun = JSON.parse(await readFile(stateFile, "utf-8")) as {
      sources: Record<string, { repoUrl: string; lastCommit: string; plugins: Record<string, { commitSha: string }> }>;
    };
    expect(stateAfterFirstRun.sources.codex?.repoUrl).toBe(upstream.bareRepoUrl);
    expect(stateAfterFirstRun.sources.codex?.lastCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(stateAfterFirstRun.sources.codex?.plugins["codex-github"]?.commitSha).toBe(
      generatedManifest._source.commitSha,
    );

    await writeFile(join(upstream.pluginDir, "README.md"), "# Updated plugin\n", "utf-8");
    await runGit(["add", "codex-github/README.md"], upstream.sourceRepo);
    await runGit(["commit", "-m", "Update plugin"], upstream.sourceRepo);
    const updatedHead = await runGit(["rev-parse", "HEAD"], upstream.sourceRepo);
    await runGit(["push", "origin", "HEAD"], upstream.sourceRepo);

    const secondReport = await pipeline.run();
    expect(secondReport).toEqual({ updated: 1, total: 1 });

    const regeneratedManifest = JSON.parse(
      await readFile(join(generatedPluginDir, "plugin.json"), "utf-8"),
    ) as { _source: { commitSha: string } };
    expect(regeneratedManifest._source.commitSha).toBe(updatedHead);

    const marketplace = JSON.parse(
      await readFile(join(workspaceDir, "output", "marketplace.json"), "utf-8"),
    ) as { plugins: Array<{ name: string; source: string }> };
    expect(marketplace.plugins).toEqual([
      {
        name: "codex--github",
        source: "plugins/codex--github",
        description: "GitHub integration plugin for Codex (from Codex)",
      },
    ]);
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

    expect(secondReport).toEqual({ updated: 0, total: 1 });
    await expect(readFile(join(workspaceDir, "output", "plugins", "codex--github", "plugin.json"), "utf-8")).resolves.toContain(
      '"name": "codex--github"',
    );

    const marketplace = JSON.parse(
      await readFile(join(workspaceDir, "output", "marketplace.json"), "utf-8"),
    ) as { plugins: Array<{ name: string }> };
    expect(marketplace.plugins).toEqual([
      {
        name: "codex--github",
        source: "plugins/codex--github",
        description: "GitHub integration plugin for Codex (from Codex)",
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

    expect(secondReport).toEqual({ updated: 0, total: 1 });
    expect(parseCalls).toHaveLength(0);
    await expect(readFile(join(workspaceDir, "output", "marketplace.json"), "utf-8")).resolves.toContain(
      '"name": "codex--github"',
    );
  });

  test("main executes the sync command and prints the report", async () => {
    const run = mock(async () => ({ updated: 2, total: 3 }));
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
});

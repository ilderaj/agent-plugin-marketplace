import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { randomUUID } from "crypto";
import { join } from "path";
import { SyncStateManager, type SyncState } from "../../src/sync/sync-state";

const GENERATED_ROOT = join(import.meta.dir, "..", ".generated", "sync-state");

let workspaceDir: string;
let stateFilePath: string;

async function createWorkspace(name: string): Promise<string> {
  await mkdir(GENERATED_ROOT, { recursive: true });
  const dir = join(GENERATED_ROOT, `${name}-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

describe("SyncStateManager", () => {
  beforeEach(async () => {
    workspaceDir = await createWorkspace("workspace");
    stateFilePath = join(workspaceDir, "data", "sync-state.json");
  });

  afterEach(async () => {
    await rm(workspaceDir, { recursive: true, force: true });
  });

  test("load returns an empty default state when the file is missing", async () => {
    const manager = new SyncStateManager(stateFilePath);

    await expect(manager.load()).resolves.toEqual({
      lastSyncAt: "",
      sources: {},
    });
  });

  test("load resets to the default state when the file is still missing after in-memory mutations", async () => {
    const manager = new SyncStateManager(stateFilePath);

    await manager.load();
    manager.markSynced("codex", "github", "plugin-sha-1");

    await expect(manager.load()).resolves.toEqual({
      lastSyncAt: "",
      sources: {},
    });
  });

  test("save persists state to disk and load reads it back", async () => {
    const state: SyncState = {
      lastSyncAt: "2026-04-14T03:00:00.000Z",
      toolchainFingerprint: "toolchain-v1",
      sources: {
        codex: {
          repoUrl: "https://github.com/openai/plugins",
          lastCommit: "repo-sha-1",
          plugins: {
            github: {
              commitSha: "plugin-sha-1",
              syncedAt: "2026-04-14T03:00:00.000Z",
            },
          },
        },
      },
    };
    const manager = new SyncStateManager(stateFilePath, "toolchain-v1");

    await manager.save(state);

    await expect(readFile(stateFilePath, "utf-8")).resolves.toContain('"github"');
    const reloadedManager = new SyncStateManager(stateFilePath);
    await expect(reloadedManager.load()).resolves.toEqual(state);
  });

  test("save without loading first persists the default state", async () => {
    const manager = new SyncStateManager(stateFilePath);

    await manager.save();

    const persisted = JSON.parse(await readFile(stateFilePath, "utf-8")) as SyncState;
    expect(persisted).toEqual({
      lastSyncAt: "",
      sources: {},
    });
  });

  test("needsUpdate returns true for unknown entries and false for the same sha when toolchain matches", async () => {
    const manager = new SyncStateManager(stateFilePath, "toolchain-v1");

    expect(manager.needsUpdate("codex", "github", "plugin-sha-1")).toBe(true);

    await manager.load();
    manager.markSynced("codex", "github", "plugin-sha-1");

    expect(manager.needsUpdate("codex", "github", "plugin-sha-1")).toBe(false);
    expect(manager.needsUpdate("codex", "github", "plugin-sha-2")).toBe(true);
    expect(manager.needsUpdate("codex", "figma", "plugin-sha-1")).toBe(true);
  });

  test("needsUpdate returns true when toolchain fingerprint changes", async () => {
    const initialManager = new SyncStateManager(stateFilePath, "toolchain-v1");
    await initialManager.load();
    initialManager.markSynced("codex", "github", "plugin-sha-1");
    await initialManager.save();

    const updatedManager = new SyncStateManager(stateFilePath, "toolchain-v2");
    await updatedManager.load();

    expect(updatedManager.needsUpdate("codex", "github", "plugin-sha-1")).toBe(true);
  });

  test("needsUpdate returns true for legacy state without a stored toolchain fingerprint", async () => {
    await mkdir(join(workspaceDir, "data"), { recursive: true });
    await writeFile(
      stateFilePath,
      `${JSON.stringify(
        {
          lastSyncAt: "2026-04-14T03:00:00.000Z",
          sources: {
            codex: {
              repoUrl: "https://github.com/openai/plugins",
              lastCommit: "repo-sha-1",
              plugins: {
                github: {
                  commitSha: "plugin-sha-1",
                  syncedAt: "2026-04-14T03:00:00.000Z",
                },
              },
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    const manager = new SyncStateManager(stateFilePath, "toolchain-v1");
    await manager.load();

    expect(manager.needsUpdate("codex", "github", "plugin-sha-1")).toBe(true);
  });

  test("needsUpdate keeps legacy toolchain invalidation for later unchanged plugins in the same run", async () => {
    await mkdir(join(workspaceDir, "data"), { recursive: true });
    await writeFile(
      stateFilePath,
      `${JSON.stringify(
        {
          lastSyncAt: "2026-04-14T03:00:00.000Z",
          sources: {
            codex: {
              repoUrl: "https://github.com/openai/plugins",
              lastCommit: "repo-sha-1",
              plugins: {
                github: {
                  commitSha: "plugin-sha-1",
                  syncedAt: "2026-04-14T03:00:00.000Z",
                },
                figma: {
                  commitSha: "plugin-sha-2",
                  syncedAt: "2026-04-14T03:00:00.000Z",
                },
              },
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    const manager = new SyncStateManager(stateFilePath, "toolchain-v1");
    await manager.load();

    expect(manager.needsUpdate("codex", "github", "plugin-sha-1")).toBe(true);

    manager.markSynced("codex", "github", "plugin-sha-1");

    expect(manager.needsUpdate("codex", "figma", "plugin-sha-2")).toBe(true);
  });

  test("needsUpdate stops invalidating a legacy plugin after it is marked synced in the same run", async () => {
    await mkdir(join(workspaceDir, "data"), { recursive: true });
    await writeFile(
      stateFilePath,
      `${JSON.stringify(
        {
          lastSyncAt: "2026-04-14T03:00:00.000Z",
          sources: {
            codex: {
              repoUrl: "https://github.com/openai/plugins",
              lastCommit: "repo-sha-1",
              plugins: {
                github: {
                  commitSha: "plugin-sha-1",
                  syncedAt: "2026-04-14T03:00:00.000Z",
                },
              },
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    const manager = new SyncStateManager(stateFilePath, "toolchain-v1");
    await manager.load();

    expect(manager.needsUpdate("codex", "github", "plugin-sha-1")).toBe(true);

    manager.markSynced("codex", "github", "plugin-sha-1");

    expect(manager.needsUpdate("codex", "github", "plugin-sha-1")).toBe(false);
  });

  test("markSynced creates missing platform and plugin entries and stamps syncedAt", async () => {
    const manager = new SyncStateManager(stateFilePath);

    await manager.load();
    manager.markSynced("cursor", "learning", "plugin-sha-9");
    await manager.save();

    const state = await new SyncStateManager(stateFilePath).load();
    expect(state.sources.cursor).toBeDefined();
    expect(state.sources.cursor?.repoUrl).toBe("");
    expect(state.sources.cursor?.lastCommit).toBe("");
    expect(state.sources.cursor?.plugins.learning.commitSha).toBe("plugin-sha-9");
    expect(state.sources.cursor?.plugins.learning.syncedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
    expect(state.lastSyncAt).toBe(state.sources.cursor?.plugins.learning.syncedAt);
  });

  test("updateSource stores repo metadata without requiring a plugin update", async () => {
    const manager = new SyncStateManager(stateFilePath);

    await manager.load();
    manager.updateSource("codex", "file:///repos/codex.git", "repo-sha-22");
    await manager.save();

    const state = await new SyncStateManager(stateFilePath).load();
    expect(state.sources.codex).toEqual({
      repoUrl: "file:///repos/codex.git",
      lastCommit: "repo-sha-22",
      plugins: {},
    });
    expect(state.lastSyncAt).toBe("");
  });

  test("removePlugin deletes the plugin entry from state and persists correctly", async () => {
    const manager = new SyncStateManager(stateFilePath);

    await manager.load();
    manager.markSynced("codex", "github", "plugin-sha-1");
    expect(manager.hasPlugin("codex", "github")).toBe(true);

    manager.removePlugin("codex", "github");
    expect(manager.hasPlugin("codex", "github")).toBe(false);
    expect(manager.getKnownPluginNames("codex")).not.toContain("github");

    await manager.save();

    const reloaded = new SyncStateManager(stateFilePath);
    await reloaded.load();
    expect(reloaded.hasPlugin("codex", "github")).toBe(false);
  });

  test("removePlugin is a no-op when platform or plugin does not exist", async () => {
    const manager = new SyncStateManager(stateFilePath);
    await manager.load();

    // neither platform nor plugin exists — must not throw
    expect(() => manager.removePlugin("codex", "nonexistent")).not.toThrow();
    expect(() => manager.removePlugin("nonexistent-platform", "anything")).not.toThrow();
  });

  test("load throws when the state file contains invalid JSON", async () => {
    await mkdir(join(workspaceDir, "data"), { recursive: true });
    await writeFile(stateFilePath, "{ invalid json", "utf-8");
    const manager = new SyncStateManager(stateFilePath);

    await expect(manager.load()).rejects.toThrow();
  });

  test("save without an explicit state persists in-memory changes", async () => {
    const manager = new SyncStateManager(stateFilePath);

    await manager.load();
    manager.markSynced("claude-code", "code-review", "plugin-sha-7");
    await manager.save();

    const persisted = JSON.parse(await readFile(stateFilePath, "utf-8")) as SyncState;
    expect(persisted.sources["claude-code"]?.plugins["code-review"]?.commitSha).toBe("plugin-sha-7");
    expect(persisted.lastSyncAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

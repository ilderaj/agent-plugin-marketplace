import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname } from "path";

export interface SyncPluginState {
  commitSha: string;
  syncedAt: string;
}

export interface SyncSourceState {
  repoUrl: string;
  lastCommit: string;
  plugins: Record<string, SyncPluginState>;
}

export interface SyncState {
  lastSyncAt: string;
  sources: Record<string, SyncSourceState>;
}

function createDefaultState(): SyncState {
  return {
    lastSyncAt: "",
    sources: {},
  };
}

function cloneState(state: SyncState): SyncState {
  return {
    lastSyncAt: state.lastSyncAt,
    sources: Object.fromEntries(
      Object.entries(state.sources).map(([platform, source]) => [
        platform,
        {
          repoUrl: source.repoUrl,
          lastCommit: source.lastCommit,
          plugins: Object.fromEntries(
            Object.entries(source.plugins).map(([pluginName, plugin]) => [
              pluginName,
              {
                commitSha: plugin.commitSha,
                syncedAt: plugin.syncedAt,
              },
            ]),
          ),
        },
      ]),
    ),
  };
}

export class SyncStateManager {
  private state: SyncState = createDefaultState();
  private hasLoaded = false;

  constructor(private readonly filePath: string) {}

  async load(): Promise<SyncState> {
    try {
      const content = await readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(content) as SyncState;
      this.state = parsed;
      this.hasLoaded = true;
      return cloneState(this.state);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.state = createDefaultState();
        this.hasLoaded = true;
        return cloneState(this.state);
      }

      throw error;
    }
  }

  async save(state?: SyncState): Promise<void> {
    if (state) {
      this.state = cloneState(state);
      this.hasLoaded = true;
    } else if (!this.hasLoaded) {
      this.state = createDefaultState();
      this.hasLoaded = true;
    }

    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(this.state, null, 2)}\n`, "utf-8");
  }

  needsUpdate(platform: string, pluginName: string, currentSha: string): boolean {
    const source = this.state.sources[platform];
    if (!source) {
      return true;
    }

    const plugin = source.plugins[pluginName];
    if (!plugin) {
      return true;
    }

    return plugin.commitSha !== currentSha;
  }

  hasPlugin(platform: string, pluginName: string): boolean {
    return Boolean(this.state.sources[platform]?.plugins[pluginName]);
  }

  getKnownPluginNames(platform: string): string[] {
    return Object.keys(this.state.sources[platform]?.plugins ?? {});
  }

  removePlugin(platform: string, pluginName: string): void {
    const source = this.state.sources[platform];
    if (!source) {
      return;
    }
    delete source.plugins[pluginName];
  }

  updateSource(platform: string, repoUrl: string, lastCommit: string): void {
    const source = (this.state.sources[platform] ??= {
      repoUrl: "",
      lastCommit: "",
      plugins: {},
    });

    source.repoUrl = repoUrl;
    source.lastCommit = lastCommit;
    this.hasLoaded = true;
  }

  markSynced(
    platform: string,
    pluginName: string,
    sha: string,
    sourceMetadata?: { repoUrl?: string; lastCommit?: string },
  ): void {
    const syncedAt = new Date().toISOString();
    const source = (this.state.sources[platform] ??= {
      repoUrl: "",
      lastCommit: "",
      plugins: {},
    });

    if (sourceMetadata?.repoUrl) {
      source.repoUrl = sourceMetadata.repoUrl;
    }

    if (sourceMetadata?.lastCommit) {
      source.lastCommit = sourceMetadata.lastCommit;
    }

    source.plugins[pluginName] = {
      commitSha: sha,
      syncedAt,
    };
    this.state.lastSyncAt = syncedAt;
    this.hasLoaded = true;
  }
}

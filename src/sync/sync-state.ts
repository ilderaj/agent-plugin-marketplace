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
  toolchainFingerprint?: string;
  sources: Record<string, SyncSourceState>;
}

function createDefaultState(): SyncState {
  return {
    lastSyncAt: "",
    sources: {},
  };
}

function cloneState(state: SyncState): SyncState {
  const cloned: SyncState = {
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

  if (state.toolchainFingerprint !== undefined) {
    cloned.toolchainFingerprint = state.toolchainFingerprint;
  }

  return cloned;
}

function getPluginKey(platform: string, pluginName: string): string {
  return `${platform}:${pluginName}`;
}

function getLoadedPluginKeys(state: SyncState): Set<string> {
  return new Set(
    Object.entries(state.sources).flatMap(([platform, source]) =>
      Object.keys(source.plugins).map((pluginName) => getPluginKey(platform, pluginName)),
    ),
  );
}

export class SyncStateManager {
  private state: SyncState = createDefaultState();
  private loadedPluginKeys = new Set<string>();
  private loadedToolchainFingerprint?: string;
  private syncedPluginKeys = new Set<string>();
  private hasLoaded = false;

  constructor(
    private readonly filePath: string,
    private currentToolchainFingerprint?: string,
  ) {}

  setToolchainFingerprint(toolchainFingerprint: string): void {
    this.currentToolchainFingerprint = toolchainFingerprint;
  }

  async load(): Promise<SyncState> {
    try {
      const content = await readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(content) as SyncState;
      this.state = parsed;
      this.loadedPluginKeys = getLoadedPluginKeys(parsed);
      this.loadedToolchainFingerprint = parsed.toolchainFingerprint;
      this.syncedPluginKeys.clear();
      this.hasLoaded = true;
      return cloneState(this.state);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.state = createDefaultState();
        this.loadedPluginKeys = getLoadedPluginKeys(this.state);
        this.loadedToolchainFingerprint = this.state.toolchainFingerprint;
        this.syncedPluginKeys.clear();
        this.hasLoaded = true;
        return cloneState(this.state);
      }

      throw error;
    }
  }

  async save(state?: SyncState): Promise<void> {
    if (state) {
      this.state = cloneState(state);
      this.loadedPluginKeys = getLoadedPluginKeys(this.state);
      this.loadedToolchainFingerprint = this.state.toolchainFingerprint;
      this.syncedPluginKeys.clear();
      this.hasLoaded = true;
    } else if (!this.hasLoaded) {
      this.state = createDefaultState();
      this.loadedPluginKeys = getLoadedPluginKeys(this.state);
      this.loadedToolchainFingerprint = this.state.toolchainFingerprint;
      this.syncedPluginKeys.clear();
      this.hasLoaded = true;
    }

    this.persistCurrentToolchainFingerprint();
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

    const pluginKey = getPluginKey(platform, pluginName);

    if (
      this.currentToolchainFingerprint !== undefined &&
      this.loadedPluginKeys.has(pluginKey) &&
      !this.syncedPluginKeys.has(pluginKey) &&
      this.loadedToolchainFingerprint !== this.currentToolchainFingerprint
    ) {
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
    this.syncedPluginKeys.delete(getPluginKey(platform, pluginName));
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

    this.persistCurrentToolchainFingerprint();
    source.plugins[pluginName] = {
      commitSha: sha,
      syncedAt,
    };
    this.syncedPluginKeys.add(getPluginKey(platform, pluginName));
    this.state.lastSyncAt = syncedAt;
    this.hasLoaded = true;
  }

  private persistCurrentToolchainFingerprint(): void {
    if (this.currentToolchainFingerprint !== undefined) {
      this.state.toolchainFingerprint = this.currentToolchainFingerprint;
    }
  }
}

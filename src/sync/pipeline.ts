import { createHash } from "crypto";
import { readFileSync, statSync } from "fs";
import { mkdir, readdir, readFile, stat, writeFile } from "fs/promises";
import { join, relative } from "path";
import type { Platform, PluginIR, SourceAdapter } from "../adapters/types";
import type {
  MarketplaceConfig,
  MarketplacePluginEntry,
  MetaPluginManifest,
  OfficialPluginManifest,
} from "../generator/marketplace";
import {
  createMarketplaceEntryFromManifests,
  MarketplaceGenerator,
} from "../generator/marketplace";
import { normalizeGeneratedPluginName, VsCodePluginGenerator } from "../generator/vscode-plugin";
import { cloneOrPull, getFileCommitSha, getHeadSha } from "../utils/git";
import { SyncStateManager } from "./sync-state";

export interface SyncConfig {
  cacheDir: string;
  outputDir: string;
  toolchainFingerprint?: string;
  repoUrls: Partial<Record<Platform, string>>;
  marketplace: MarketplaceConfig;
}

export interface SyncReportEntry {
  name: string;
  platform: string;
}

export interface SyncReport {
  updated: number;
  total: number;
  added: SyncReportEntry[];
  removed: SyncReportEntry[];
  changed: SyncReportEntry[];
}

export interface SyncPipelineOptions {
  adapters: SourceAdapter[];
  generator: VsCodePluginGenerator;
  marketplaceGen: MarketplaceGenerator;
  stateManager: SyncStateManager;
  config: SyncConfig;
}

const TOOLCHAIN_RUNTIME_FILES = [
  "adapters/claude.ts",
  "adapters/codex.ts",
  "adapters/cursor.ts",
  "adapters/types.ts",
  "generator/marketplace.ts",
  "generator/vscode-plugin.ts",
  "sync/pipeline.ts",
  "sync/sync-state.ts",
  "utils/git.ts",
] as const;

export function computeDefaultToolchainFingerprint(runtimeRoot = join(import.meta.dir, "..")): string {
  const hash = createHash("sha256");

  for (const relativePath of TOOLCHAIN_RUNTIME_FILES) {
    const filePath = join(runtimeRoot, relativePath);
    try {
      if (!statSync(filePath).isFile()) {
        continue;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        continue;
      }

      throw error;
    }

    hash.update(relativePath);
    hash.update("\0");
    hash.update(readFileSync(filePath));
    hash.update("\0");
  }

  return hash.digest("hex");
}

export class SyncPipeline {
  constructor(private readonly options: SyncPipelineOptions) {}

  async run(): Promise<SyncReport> {
    this.options.stateManager.setToolchainFingerprint(
      this.options.config.toolchainFingerprint ?? computeDefaultToolchainFingerprint(),
    );
    await this.options.stateManager.load();

    let updated = 0;
    const added: SyncReportEntry[] = [];
    const changed: SyncReportEntry[] = [];
    const removed: SyncReportEntry[] = [];

    for (const adapter of this.options.adapters) {
      const repoUrl = this.options.config.repoUrls[adapter.platform];
      if (!repoUrl) {
        throw new Error(`Missing repo URL for platform ${adapter.platform}`);
      }

      const repoDir = join(this.options.config.cacheDir, adapter.platform);
      await cloneOrPull(repoUrl, repoDir);
      const headSha = await getHeadSha(repoDir);
      this.options.stateManager.updateSource(adapter.platform, repoUrl, headSha);

      const previousPluginNames = new Set(
        this.options.stateManager.getKnownPluginNames(adapter.platform),
      );

      const discoveredPlugins = (await this.discoverPlugins(adapter, repoDir)).sort((left, right) =>
        left.name.localeCompare(right.name),
      );

      const discoveredNames = new Set(discoveredPlugins.map((p) => p.name));

      for (const plugin of discoveredPlugins) {
        const pluginCommitSha = await getFileCommitSha(repoDir, relative(repoDir, plugin.path));
        if (!this.options.stateManager.needsUpdate(adapter.platform, plugin.name, pluginCommitSha)) {
          continue;
        }

        const isNew = !this.options.stateManager.hasPlugin(adapter.platform, plugin.name);

        const ir = await adapter.parse(plugin.path);
        const hydratedIr = this.hydrateIR(ir, repoUrl, pluginCommitSha, relative(repoDir, plugin.path));

        const outDir = join(
          this.options.config.outputDir,
          "plugins",
          normalizeGeneratedPluginName(hydratedIr),
        );
        await this.options.generator.generate(hydratedIr, outDir);
        this.options.stateManager.markSynced(adapter.platform, plugin.name, pluginCommitSha, {
          repoUrl,
          lastCommit: headSha,
        });
        updated += 1;

        const entry: SyncReportEntry = { name: plugin.name, platform: adapter.platform };
        if (isNew) {
          added.push(entry);
        } else {
          changed.push(entry);
        }
      }

      // Plugins previously known but no longer discovered are removed
      for (const name of previousPluginNames) {
        if (!discoveredNames.has(name)) {
          this.options.stateManager.removePlugin(adapter.platform, name);
          removed.push({ name, platform: adapter.platform });
        }
      }
    }

    const marketplaceEntries = await this.loadGeneratedMarketplaceEntries();
    await this.writeMarketplace(marketplaceEntries);
    await this.options.stateManager.save();

    return {
      updated,
      total: marketplaceEntries.length,
      added,
      removed,
      changed,
    };
  }

  private hydrateIR(ir: PluginIR, repoUrl: string, commitSha: string, pluginRelPath: string): PluginIR {
    return {
      ...ir,
      source: {
        ...ir.source,
        repoUrl,
        commitSha,
        pluginRelPath,
      },
    };
  }

  private async discoverPlugins(adapter: SourceAdapter, repoDir: string) {
    const nestedPluginsDir = join(repoDir, "plugins");

    try {
      const nestedStat = await stat(nestedPluginsDir);
      if (nestedStat.isDirectory()) {
        const discoveredInNestedDir = await adapter.discover(nestedPluginsDir);
        if (discoveredInNestedDir.length > 0) {
          return discoveredInNestedDir;
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" && (error as NodeJS.ErrnoException).code !== "ENOTDIR") {
        throw error;
      }
    }

    return adapter.discover(repoDir);
  }

  private async loadGeneratedMarketplaceEntries(): Promise<MarketplacePluginEntry[]> {
    const pluginsDir = join(this.options.config.outputDir, "plugins");

    try {
      const entries = await readdir(pluginsDir, { withFileTypes: true });
      const marketplaceEntries: MarketplacePluginEntry[] = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const official = JSON.parse(
          await readFile(join(pluginsDir, entry.name, "plugin.json"), "utf-8"),
        ) as OfficialPluginManifest;
        const meta = JSON.parse(
          await readFile(join(pluginsDir, entry.name, "_meta.json"), "utf-8"),
        ) as MetaPluginManifest;
        marketplaceEntries.push(createMarketplaceEntryFromManifests(official, meta));
      }

      return marketplaceEntries;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }

      throw error;
    }
  }

  private async writeMarketplace(entries: MarketplacePluginEntry[]): Promise<void> {
    const marketplace = this.options.marketplaceGen.generateFromEntries(entries);
    const content = `${JSON.stringify(marketplace, null, 2)}\n`;

    // Write root marketplace.json
    const rootPath = join(this.options.config.outputDir, "marketplace.json");
    await mkdir(this.options.config.outputDir, { recursive: true });
    await writeFile(rootPath, content, "utf-8");

    // Write .github/plugin/marketplace.json (Copilot CLI discovery path)
    const githubPath = join(this.options.config.outputDir, ".github", "plugin", "marketplace.json");
    await mkdir(join(this.options.config.outputDir, ".github", "plugin"), { recursive: true });
    await writeFile(githubPath, content, "utf-8");

    // Write .claude-plugin/marketplace.json (Claude/VS Code marketplace discovery path)
    const claudePath = join(this.options.config.outputDir, ".claude-plugin", "marketplace.json");
    await mkdir(join(this.options.config.outputDir, ".claude-plugin"), { recursive: true });
    await writeFile(claudePath, content, "utf-8");
  }
}

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
  repoUrls: Partial<Record<Platform, string>>;
  marketplace: MarketplaceConfig;
}

export interface SyncReport {
  updated: number;
  total: number;
}

export interface SyncPipelineOptions {
  adapters: SourceAdapter[];
  generator: VsCodePluginGenerator;
  marketplaceGen: MarketplaceGenerator;
  stateManager: SyncStateManager;
  config: SyncConfig;
}

export class SyncPipeline {
  constructor(private readonly options: SyncPipelineOptions) {}

  async run(): Promise<SyncReport> {
    await this.options.stateManager.load();

    let updated = 0;

    for (const adapter of this.options.adapters) {
      const repoUrl = this.options.config.repoUrls[adapter.platform];
      if (!repoUrl) {
        throw new Error(`Missing repo URL for platform ${adapter.platform}`);
      }

      const repoDir = join(this.options.config.cacheDir, adapter.platform);
      await cloneOrPull(repoUrl, repoDir);
      const headSha = await getHeadSha(repoDir);
      this.options.stateManager.updateSource(adapter.platform, repoUrl, headSha);

      const discoveredPlugins = (await this.discoverPlugins(adapter, repoDir)).sort((left, right) =>
        left.name.localeCompare(right.name),
      );

      for (const plugin of discoveredPlugins) {
        const pluginCommitSha = await getFileCommitSha(repoDir, relative(repoDir, plugin.path));
        if (!this.options.stateManager.needsUpdate(adapter.platform, plugin.name, pluginCommitSha)) {
          continue;
        }

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
      }
    }

    const marketplaceEntries = await this.loadGeneratedMarketplaceEntries();
    await this.writeMarketplace(marketplaceEntries);
    await this.options.stateManager.save();

    return {
      updated,
      total: marketplaceEntries.length,
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
  }
}

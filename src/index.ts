import { join } from "path";
import { writeFile } from "fs/promises";
import { AscSkillsAdapter } from "./adapters/asc-skills";
import { ClaudeAdapter } from "./adapters/claude";
import { CodexAdapter } from "./adapters/codex";
import { CursorAdapter } from "./adapters/cursor";
import { MarketplaceGenerator } from "./generator/marketplace";
import { VsCodePluginGenerator } from "./generator/vscode-plugin";
import { SyncPipeline, type SyncConfig, type SyncReport } from "./sync/pipeline";
import { formatSyncReportAsMarkdown } from "./sync/report-formatter";
import { SyncStateManager } from "./sync/sync-state";

const DEFAULT_REPO_URLS = {
  codex: "https://github.com/openai/plugins.git",
  "claude-code": "https://github.com/anthropics/claude-code.git",
  cursor: "https://github.com/cursor/plugins.git",
  community: "https://github.com/rorkai/app-store-connect-cli-skills.git",
} satisfies SyncConfig["repoUrls"];

type PipelineRunner = Pick<SyncPipeline, "run">;

interface LoggerLike {
  log(message: string): void;
  error(message: string): void;
}

export interface MainDependencies {
  createPipeline?: () => PipelineRunner;
  logger?: LoggerLike;
}

export function createDefaultSyncConfig(baseDir = process.cwd()): SyncConfig {
  return {
    cacheDir: join(baseDir, ".cache", "sync"),
    outputDir: baseDir,
    repoUrls: {
      codex: Bun.env.CODEX_REPO_URL ?? DEFAULT_REPO_URLS.codex,
      "claude-code": Bun.env.CLAUDE_CODE_REPO_URL ?? DEFAULT_REPO_URLS["claude-code"],
      cursor: Bun.env.CURSOR_REPO_URL ?? DEFAULT_REPO_URLS.cursor,
      community: Bun.env.ASC_SKILLS_REPO_URL ?? DEFAULT_REPO_URLS.community,
    },
    marketplace: {
      name: "agent-plugin-marketplace",
      owner: {
        name: Bun.env.MARKETPLACE_OWNER_NAME ?? "agent-plugin-marketplace",
        ...(Bun.env.MARKETPLACE_OWNER_EMAIL ? { email: Bun.env.MARKETPLACE_OWNER_EMAIL } : {}),
        ...(Bun.env.MARKETPLACE_OWNER_URL ? { url: Bun.env.MARKETPLACE_OWNER_URL } : {}),
      },
      metadata: {
        description:
          Bun.env.MARKETPLACE_DESCRIPTION ??
          "Cross-platform agent plugins converted for VS Code",
      },
    },
  };
}

export function createPipeline(config = createDefaultSyncConfig()): SyncPipeline {
  return new SyncPipeline({
    adapters: [new CodexAdapter(), new ClaudeAdapter(), new CursorAdapter(), new AscSkillsAdapter()],
    generator: new VsCodePluginGenerator(),
    marketplaceGen: new MarketplaceGenerator(config.marketplace),
    stateManager: new SyncStateManager(join(config.outputDir, "data", "sync-state.json")),
    config,
  });
}

export async function main(
  args: string[] = Bun.argv.slice(2),
  dependencies: MainDependencies = {},
): Promise<SyncReport | null> {
  const [command] = args;
  const logger = dependencies.logger ?? console;

  if (command !== "sync") {
    logger.error(`Unknown command: ${command ?? ""}`.trim());
    return null;
  }

  const pipeline = dependencies.createPipeline ? dependencies.createPipeline() : createPipeline();
  try {
    const report = await pipeline.run();
    logger.log(`Synced ${report.updated}/${report.total} plugins`);

    const reportPath = Bun.env.SYNC_REPORT_PATH;
    if (reportPath) {
      await writeFile(reportPath, formatSyncReportAsMarkdown(report), "utf-8");
    }

    return report;
  } catch (error) {
    logger.error(`Sync failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

if (import.meta.main) {
  await main();
}

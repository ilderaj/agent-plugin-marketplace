import { describe, expect, test } from "bun:test";
import { existsSync } from "fs";
import { readFile, readdir, stat } from "fs/promises";
import { join } from "path";

const REPO_ROOT = join(import.meta.dir, "../..");
const PLUGINS_DIR = join(REPO_ROOT, "plugins");

const OFFICIAL_COMPONENTS = [
  { key: "skills", canonicalPath: "skills", expectedType: "directory" },
  { key: "agents", canonicalPath: "agents", expectedType: "directory" },
  { key: "commands", canonicalPath: "commands", expectedType: "directory" },
  { key: "hooks", canonicalPath: "hooks/hooks.json", expectedType: "file" },
  { key: "mcpServers", canonicalPath: ".mcp.json", expectedType: "file" },
] as const;

type PluginManifest = Partial<Record<(typeof OFFICIAL_COMPONENTS)[number]["key"], string>>;

function normalizeManifestPath(path: string): string {
  return path.replace(/^[.][/\\]/, "").replace(/[\\/]+$/, "");
}

async function listPluginNames(): Promise<string[]> {
  const entries = await readdir(PLUGINS_DIR, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

async function readManifest(pluginName: string): Promise<PluginManifest> {
  return JSON.parse(await readFile(join(PLUGINS_DIR, pluginName, "plugin.json"), "utf8")) as PluginManifest;
}

async function collectAgentNames(pluginName: string, manifest: PluginManifest): Promise<string[]> {
  if (!manifest.agents) return [];

  const agentsDir = join(PLUGINS_DIR, pluginName, normalizeManifestPath(manifest.agents));
  if (!existsSync(agentsDir)) return [];

  const entries = await readdir(agentsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name.replace(/\.md$/, ""));
}

describe("generated artifact audit", () => {
  test("top-level generated component paths stay canonical and manifest-aligned", async () => {
    const issues: string[] = [];

    for (const pluginName of await listPluginNames()) {
      const pluginDir = join(PLUGINS_DIR, pluginName);
      const manifest = await readManifest(pluginName);

      for (const component of OFFICIAL_COMPONENTS) {
        const declaredPath = manifest[component.key];
        const canonicalFullPath = join(pluginDir, component.canonicalPath);
        const canonicalExists = existsSync(canonicalFullPath);

        if (declaredPath === undefined) {
          if (canonicalExists) {
            issues.push(
              `${pluginName}: ${component.canonicalPath} exists but plugin.json omits "${component.key}".`
            );
          }
          continue;
        }

        const normalizedPath = normalizeManifestPath(declaredPath);
        const declaredFullPath = join(pluginDir, normalizedPath);

        if (normalizedPath !== component.canonicalPath) {
          issues.push(
            `${pluginName}: plugin.json "${component.key}" points to "${declaredPath}" instead of "./${component.canonicalPath}".`
          );
        }

        if (!existsSync(declaredFullPath)) {
          issues.push(
            `${pluginName}: plugin.json "${component.key}" points to missing path "${normalizedPath}".`
          );
        }

        if (!canonicalExists) {
          issues.push(
            `${pluginName}: expected generated ${component.canonicalPath} to exist for "${component.key}".`
          );
          continue;
        }

        const artifactStat = await stat(canonicalFullPath);
        const matchesExpectedType =
          component.expectedType === "directory" ? artifactStat.isDirectory() : artifactStat.isFile();
        if (!matchesExpectedType) {
          issues.push(
            `${pluginName}: ${component.canonicalPath} should be a ${component.expectedType} for "${component.key}".`
          );
        }
      }
    }

    expect(issues).toEqual([]);
  });

  test("generated plugins do not keep leftover YAML agent artifacts", async () => {
    const issues: string[] = [];
    const forbiddenPatterns = [
      "skills/*/agents/*.yaml",
      "skills/*/agents/*.yml",
      "agents/*.yaml",
      "agents/*.yml",
    ];

    for (const pluginName of await listPluginNames()) {
      const pluginDir = join(PLUGINS_DIR, pluginName);

      for (const pattern of forbiddenPatterns) {
        const matches = Array.from(new Bun.Glob(pattern).scanSync({ cwd: pluginDir })).sort();
        if (matches.length > 0) {
          issues.push(`${pluginName}: forbidden ${pattern} artifacts found: ${matches.join(", ")}`);
        }
      }
    }

    expect(issues).toEqual([]);
  });

  test("README no longer references source YAML agent filenames", async () => {
    const forbiddenMentions = new Set<string>();

    for (const pluginName of await listPluginNames()) {
      const readmePath = join(PLUGINS_DIR, pluginName, "README.md");
      if (!existsSync(readmePath)) continue;

      const readme = await readFile(readmePath, "utf8");
      const manifest = await readManifest(pluginName);
      for (const agentName of await collectAgentNames(pluginName, manifest)) {
        for (const extension of ["yaml", "yml"]) {
          const candidate = `${agentName}.${extension}`;
          if (readme.includes(candidate)) {
            forbiddenMentions.add(candidate);
          }
        }
      }
    }

    const matches = Array.from(forbiddenMentions).sort();
    expect(matches).toEqual([]);
  });

  test("MCP-bearing plugins preserve runtime metadata in _meta.json", async () => {
    const issues: string[] = [];

    for (const pluginName of await listPluginNames()) {
      const pluginDir = join(PLUGINS_DIR, pluginName);
      const mcpJsonPath = join(pluginDir, ".mcp.json");

      if (!existsSync(mcpJsonPath)) continue;

      const metaJsonPath = join(pluginDir, "_meta.json");
      if (!existsSync(metaJsonPath)) {
        issues.push(`${pluginName}: has .mcp.json but missing _meta.json`);
        continue;
      }

      const metaContent = JSON.parse(await readFile(metaJsonPath, "utf8"));
      const mcpContent = JSON.parse(await readFile(mcpJsonPath, "utf8"));

      if (!metaContent._runtime?.mcp?.servers) {
        issues.push(`${pluginName}: has .mcp.json but _meta.json lacks _runtime.mcp.servers`);
        continue;
      }

      const runtimeServers = metaContent._runtime.mcp.servers;
      const mcpServers = mcpContent.mcpServers || {};

      if (runtimeServers.length === 0) {
        issues.push(
          `${pluginName}: _runtime.mcp.servers exists but is empty (expected ${Object.keys(mcpServers).length} servers)`
        );
      }
    }

    expect(issues).toEqual([]);
  });
});

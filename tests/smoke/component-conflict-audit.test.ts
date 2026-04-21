import { describe, expect, test } from "bun:test";
import { existsSync } from "fs";
import { readFile, readdir } from "fs/promises";
import { join } from "path";

const REPO_ROOT = join(import.meta.dir, "../..");
const PLUGINS_DIR = join(REPO_ROOT, "plugins");

const ALLOWED_DUPLICATE_SKILL_NAMES = new Set([
  "cli",
  "pr-review-canvas",
  "react-best-practices",
  "stripe-best-practices",
]);

const ALLOWED_DUPLICATE_AGENT_NAMES = new Set(["code-reviewer", "openai"]);

type PluginManifest = {
  skills?: string;
  agents?: string;
};

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

async function collectSkillEntries(pluginName: string, manifest: PluginManifest): Promise<string[]> {
  if (!manifest.skills) return [];

  const skillsDir = join(PLUGINS_DIR, pluginName, normalizeManifestPath(manifest.skills));
  if (!existsSync(skillsDir)) return [];

  const entries = await readdir(skillsDir, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

async function collectAgentEntries(pluginName: string, manifest: PluginManifest): Promise<string[]> {
  if (!manifest.agents) return [];

  const agentsDir = join(PLUGINS_DIR, pluginName, normalizeManifestPath(manifest.agents));
  if (!existsSync(agentsDir)) return [];

  const entries = await readdir(agentsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name.replace(/\.md$/, ""))
    .sort();
}

function findUnexpectedDuplicates(
  componentsByName: Map<string, string[]>,
  allowlist: Set<string>
): string[] {
  return Array.from(componentsByName.entries())
    .filter(([name, locations]) => locations.length > 1 && !allowlist.has(name))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, locations]) => `${name}: ${locations.sort().join(", ")}`);
}

describe("component conflict audit", () => {
  test("new duplicate skill names are rejected while the current allowlist stays allowed", async () => {
    const skillLocations = new Map<string, string[]>();

    for (const pluginName of await listPluginNames()) {
      const manifest = await readManifest(pluginName);
      for (const skillName of await collectSkillEntries(pluginName, manifest)) {
        const locations = skillLocations.get(skillName) ?? [];
        locations.push(`${pluginName}/skills/${skillName}`);
        skillLocations.set(skillName, locations);
      }
    }

    expect(findUnexpectedDuplicates(skillLocations, ALLOWED_DUPLICATE_SKILL_NAMES)).toEqual([]);
  });

  test("new duplicate agent names are rejected while the current allowlist stays allowed", async () => {
    const agentLocations = new Map<string, string[]>();

    for (const pluginName of await listPluginNames()) {
      const manifest = await readManifest(pluginName);
      for (const agentName of await collectAgentEntries(pluginName, manifest)) {
        const locations = agentLocations.get(agentName) ?? [];
        locations.push(`${pluginName}/agents/${agentName}.md`);
        agentLocations.set(agentName, locations);
      }
    }

    expect(findUnexpectedDuplicates(agentLocations, ALLOWED_DUPLICATE_AGENT_NAMES)).toEqual([]);
  });
});

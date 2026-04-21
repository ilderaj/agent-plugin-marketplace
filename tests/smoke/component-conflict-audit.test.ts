import { describe, expect, test } from "bun:test";
import { existsSync } from "fs";
import { readFile, readdir } from "fs/promises";
import { join } from "path";

const REPO_ROOT = join(import.meta.dir, "../..");
const PLUGINS_DIR = join(REPO_ROOT, "plugins");

const EXPECTED_DUPLICATE_SKILL_LOCATIONS = new Map<string, string[]>([
  ["cli", ["codex--circleci/skills/cli", "codex--hugging-face/skills/cli"]],
  [
    "pr-review-canvas",
    ["cursor--cursor-team-kit/skills/pr-review-canvas", "cursor--pr-review-canvas/skills/pr-review-canvas"],
  ],
  [
    "react-best-practices",
    ["codex--build-web-apps/skills/react-best-practices", "codex--vercel/skills/react-best-practices"],
  ],
  [
    "stripe-best-practices",
    ["codex--build-web-apps/skills/stripe-best-practices", "codex--stripe/skills/stripe-best-practices"],
  ],
]);

const EXPECTED_DUPLICATE_AGENT_LOCATIONS = new Map<string, string[]>([
  [
    "code-reviewer",
    ["claude--feature-dev/agents/code-reviewer.md", "claude--pr-review-toolkit/agents/code-reviewer.md"],
  ],
  [
    "openai",
    [
      "codex--atlassian-rovo/agents/openai.md",
      "codex--build-ios-apps/agents/openai.md",
      "codex--build-macos-apps/agents/openai.md",
      "codex--build-web-apps/agents/openai.md",
      "codex--expo/agents/openai.md",
      "codex--figma/agents/openai.md",
      "codex--notion/agents/openai.md",
      "codex--render/agents/openai.md",
      "codex--test-android-apps/agents/openai.md",
    ],
  ],
]);

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

function findUnexpectedDuplicates(componentsByName: Map<string, string[]>, expected: Map<string, string[]>): string[] {
  return Array.from(componentsByName.entries())
    .filter(([name, locations]) => {
      if (locations.length <= 1) return false;
      const expectedLocations = expected.get(name);
      return (
        expectedLocations === undefined ||
        expectedLocations.length !== locations.length ||
        expectedLocations.some((location, index) => location !== locations.slice().sort()[index])
      );
    })
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, locations]) => `${name}: ${locations.sort().join(", ")}`);
}

function findUnexpectedDuplicateBaselineChanges(
  componentsByName: Map<string, string[]>,
  expected: Map<string, string[]>
): string[] {
  const issues: string[] = [];

  for (const [name, expectedLocations] of expected.entries()) {
    const actualLocations = componentsByName.get(name)?.slice().sort();
    if (!actualLocations) {
      issues.push(`${name}: expected duplicate baseline missing (${expectedLocations.join(", ")})`);
      continue;
    }

    if (actualLocations.length !== expectedLocations.length) {
      issues.push(
        `${name}: expected ${expectedLocations.length} occurrences but found ${actualLocations.length} (${actualLocations.join(", ")})`
      );
      continue;
    }

    for (let index = 0; index < expectedLocations.length; index += 1) {
      if (actualLocations[index] !== expectedLocations[index]) {
        issues.push(
          `${name}: expected ${expectedLocations.join(", ")} but found ${actualLocations.join(", ")}`
        );
        break;
      }
    }
  }

  return issues;
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

    expect(findUnexpectedDuplicates(skillLocations, EXPECTED_DUPLICATE_SKILL_LOCATIONS)).toEqual([]);
    expect(findUnexpectedDuplicateBaselineChanges(skillLocations, EXPECTED_DUPLICATE_SKILL_LOCATIONS)).toEqual([]);
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

    expect(findUnexpectedDuplicates(agentLocations, EXPECTED_DUPLICATE_AGENT_LOCATIONS)).toEqual([]);
    expect(findUnexpectedDuplicateBaselineChanges(agentLocations, EXPECTED_DUPLICATE_AGENT_LOCATIONS)).toEqual([]);
  });
});

import { readdir, stat } from "fs/promises";
import { join } from "path";
import type {
  Compatibility,
  DiscoveredPlugin,
  PluginIR,
  SkillRef,
  SourceAdapter,
} from "./types";

const SYNTHETIC_COMPATIBILITY: Compatibility = {
  overall: "full",
  details: [
    {
      type: "skill",
      name: "repo-root-skill-pack",
      level: "full",
      notes: "Skills follow the shared Agent Skills format and can be copied as-is.",
    },
  ],
  warnings: [
    "Requires the `asc` CLI to be installed for most workflows.",
    "This plugin manifest is synthesized from a repo-root skill pack, not an upstream plugin.json.",
  ],
  droppedComponents: [],
};

export class AscSkillsAdapter implements SourceAdapter {
  readonly platform = "community" as const;
  readonly markerDir = "skills";

  async discover(repoPath: string): Promise<DiscoveredPlugin[]> {
    const skillsDir = join(repoPath, this.markerDir);

    try {
      const skillsStat = await stat(skillsDir);
      if (!skillsStat.isDirectory()) {
        return [];
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") {
        return [];
      }

      throw error;
    }

    return [
      {
        name: "asc-cli-skills",
        path: repoPath,
        markerPath: skillsDir,
      },
    ];
  }

  async parse(pluginDir: string): Promise<PluginIR> {
    const skills = await this.parseSkills(pluginDir);

    return {
      id: "community--asc-cli-skills",
      source: {
        platform: this.platform,
        repoUrl: "https://github.com/rorkai/app-store-connect-cli-skills",
        pluginPath: pluginDir,
        commitSha: "unknown",
        version: "0.0.0",
      },
      manifest: {
        name: "asc-cli-skills",
        displayName: "ASC CLI Skills",
        version: "0.0.0",
        description: "Agent Skills for App Store Connect workflows using asc.",
        author: {
          name: "rorkai",
          url: "https://github.com/rorkai",
        },
        homepage: "https://asccli.sh/",
        repository: "https://github.com/rorkai/app-store-connect-cli-skills",
        keywords: [
          "ios",
          "macos",
          "app-store-connect",
          "testflight",
          "notarization",
          "xcode",
          "asc",
        ],
        tags: ["ios", "macos", "app-store-connect", "community"],
        raw: {},
      },
      components: {
        skills,
        hooks: [],
        agents: [],
        commands: [],
        mcpServers: [],
        rules: [],
        apps: [],
      },
      compatibility: SYNTHETIC_COMPATIBILITY,
    };
  }

  private async parseSkills(pluginDir: string): Promise<SkillRef[]> {
    const skillsDir = join(pluginDir, "skills");
    const entries = await readdir(skillsDir, { withFileTypes: true });
    const skillRefs = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const skillRoot = join(skillsDir, entry.name);
          await stat(join(skillRoot, "SKILL.md"));

          let hasScripts = false;
          try {
            hasScripts = (await stat(join(skillRoot, "scripts"))).isDirectory();
          } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code !== "ENOENT" && code !== "ENOTDIR") {
              throw error;
            }
          }

          return {
            name: entry.name,
            path: `skills/${entry.name}`,
            hasScripts,
          } satisfies SkillRef;
        }),
    );

    return skillRefs.sort((left, right) => left.name.localeCompare(right.name));
  }
}

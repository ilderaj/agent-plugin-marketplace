import { describe, test, expect } from "bun:test";
import { existsSync, statSync, readFileSync } from "fs";
import { join } from "path";

const FIXTURES_DIR = join(__dirname, "fixtures");

// Helper function to validate SKILL.md frontmatter
function validateSkillFrontmatter(skillPath: string): boolean {
  const content = readFileSync(skillPath, "utf-8");
  const lines = content.split("\n");

  // Check for opening ---
  if (!lines[0]?.trim().startsWith("---")) {
    return false;
  }

  // Find closing --- and collect frontmatter
  let closingIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim().startsWith("---")) {
      closingIndex = i;
      break;
    }
  }

  if (closingIndex === -1) {
    return false;
  }

  const frontmatter = lines.slice(1, closingIndex).join("\n");

  // Check for required fields
  return (
    /^\s*name:/m.test(frontmatter) &&
    /^\s*description:/m.test(frontmatter)
  );
}

describe("Test Fixtures Structure", () => {
  describe("codex-github fixture", () => {
    const fixturePath = join(FIXTURES_DIR, "codex-github");

    test("directory exists", () => {
      expect(existsSync(fixturePath)).toBe(true);
      expect(statSync(fixturePath).isDirectory()).toBe(true);
    });

    test(".codex-plugin/plugin.json exists and is valid JSON", () => {
      const pluginJsonPath = join(fixturePath, ".codex-plugin", "plugin.json");
      expect(existsSync(pluginJsonPath)).toBe(true);

      const content = readFileSync(pluginJsonPath, "utf-8");
      const json = JSON.parse(content);

      expect(json.name).toBeDefined();
      expect(json.version).toBeDefined();
      expect(json.description).toBeDefined();
      expect(json.author).toBeDefined();
    });

    test("plugin.json declares skills string path matching fixture structure", () => {
      const pluginJsonPath = join(fixturePath, ".codex-plugin", "plugin.json");
      const json = JSON.parse(readFileSync(pluginJsonPath, "utf-8"));

      expect(json.skills).toBeDefined();
      expect(typeof json.skills).toBe("string");

      const fullPath = join(fixturePath, json.skills);
      expect(existsSync(fullPath)).toBe(true);
    });

    test("plugin.json hooks path resolves to existing file", () => {
      const pluginJsonPath = join(fixturePath, ".codex-plugin", "plugin.json");
      const json = JSON.parse(readFileSync(pluginJsonPath, "utf-8"));

      // Verify hooks path is declared
      expect(json.hooks).toBeDefined();
      expect(typeof json.hooks).toBe("string");

      // Resolve and verify the hooks file exists
      const hooksFilePath = join(fixturePath, json.hooks);
      expect(existsSync(hooksFilePath)).toBe(true);
    });

    test("skills/github/SKILL.md exists", () => {
      const skillPath = join(fixturePath, "skills", "github", "SKILL.md");
      expect(existsSync(skillPath)).toBe(true);
    });

    test("skills/github/SKILL.md has valid frontmatter", () => {
      const skillPath = join(fixturePath, "skills", "github", "SKILL.md");
      expect(validateSkillFrontmatter(skillPath)).toBe(true);
    });

    test("skills/github/agents/openai.yaml exists", () => {
      const agentPath = join(
        fixturePath,
        "skills",
        "github",
        "agents",
        "openai.yaml",
      );
      expect(existsSync(agentPath)).toBe(true);
    });

    test("skills/github/assets/github.svg exists", () => {
      const assetPath = join(
        fixturePath,
        "skills",
        "github",
        "assets",
        "github.svg",
      );
      expect(existsSync(assetPath)).toBe(true);
    });

    test("skills/github/references/reference.md exists", () => {
      const referencePath = join(
        fixturePath,
        "skills",
        "github",
        "references",
        "reference.md",
      );
      expect(existsSync(referencePath)).toBe(true);
    });

    test("skills/github/scripts/setup.sh exists", () => {
      const scriptPath = join(
        fixturePath,
        "skills",
        "github",
        "scripts",
        "setup.sh",
      );
      expect(existsSync(scriptPath)).toBe(true);
    });

    test("hooks.json exists at root level", () => {
      const hooksPath = join(fixturePath, "hooks.json");
      expect(existsSync(hooksPath)).toBe(true);

      const content = readFileSync(hooksPath, "utf-8");
      JSON.parse(content); // Verify it's valid JSON
    });

    test("hooks.json uses events array matching HookRef IR schema", () => {
      const hooksPath = join(fixturePath, "hooks.json");
      const json = JSON.parse(readFileSync(hooksPath, "utf-8"));

      expect(json.hooks).toBeDefined();
      expect(Array.isArray(json.hooks)).toBe(true);
      expect(json.hooks.length).toBeGreaterThan(0);

      for (const hook of json.hooks) {
        expect(hook.events).toBeDefined();
        expect(Array.isArray(hook.events)).toBe(true);
        expect(hook.events.length).toBeGreaterThan(0);
      }
    });

    test("README.md exists", () => {
      const readmePath = join(fixturePath, "README.md");
      expect(existsSync(readmePath)).toBe(true);
    });

    test(".app.json exists", () => {
      const appJsonPath = join(fixturePath, ".app.json");
      expect(existsSync(appJsonPath)).toBe(true);

      const content = readFileSync(appJsonPath, "utf-8");
      JSON.parse(content); // Verify it's valid JSON
    });

    test("agents/reviewer.yaml exists", () => {
      const agentPath = join(fixturePath, "agents", "reviewer.yaml");
      expect(existsSync(agentPath)).toBe(true);
      
      const content = readFileSync(agentPath, "utf-8");
      expect(content).toContain("name:");
      expect(content).toContain("description:");
    });

    test("agents/tester.yml exists to verify .yml extension support", () => {
      const agentPath = join(fixturePath, "agents", "tester.yml");
      expect(existsSync(agentPath)).toBe(true);
      
      const content = readFileSync(agentPath, "utf-8");
      expect(content).toContain("name:");
      expect(content).toContain("description:");
    });

    test(".mcp.json exists and has valid structure", () => {
      const mcpPath = join(fixturePath, ".mcp.json");
      expect(existsSync(mcpPath)).toBe(true);
      
      const content = readFileSync(mcpPath, "utf-8");
      const json = JSON.parse(content);
      
      expect(json.mcpServers).toBeDefined();
      expect(typeof json.mcpServers).toBe("object");

      // Verify at least one server exists
      const serverNames = Object.keys(json.mcpServers);
      expect(serverNames.length).toBeGreaterThan(0);

      // Verify server structure
      for (const serverName of serverNames) {
        const server = json.mcpServers[serverName];
        expect(server.command).toBeDefined();
        expect(server.transport).toBeDefined();
      }
    });
  });

  describe("codex-string-skills fixture", () => {
    const fixturePath = join(FIXTURES_DIR, "codex-string-skills");

    test("directory exists", () => {
      expect(existsSync(fixturePath)).toBe(true);
      expect(statSync(fixturePath).isDirectory()).toBe(true);
    });

    test("plugin.json uses a string skills path", () => {
      const pluginJsonPath = join(fixturePath, ".codex-plugin", "plugin.json");
      const json = JSON.parse(readFileSync(pluginJsonPath, "utf-8"));

      expect(json.skills).toBe("./skills/");
      expect(existsSync(join(fixturePath, json.skills))).toBe(true);
    });

    test("skills directory contains multiple child skills", () => {
      const repoOpsSkill = join(fixturePath, "skills", "repo-ops", "SKILL.md");
      const issueTriageSkill = join(fixturePath, "skills", "issue-triage", "SKILL.md");

      expect(existsSync(repoOpsSkill)).toBe(true);
      expect(existsSync(issueTriageSkill)).toBe(true);
      expect(validateSkillFrontmatter(repoOpsSkill)).toBe(true);
      expect(validateSkillFrontmatter(issueTriageSkill)).toBe(true);
    });

    test(".mcp.json uses top-level mcpServers", () => {
      const mcpPath = join(fixturePath, ".mcp.json");
      const json = JSON.parse(readFileSync(mcpPath, "utf-8"));

      expect(json.mcpServers).toBeDefined();
      expect(json.servers).toBeUndefined();
    });
  });

  describe("codex-hooks-object fixture", () => {
    const fixturePath = join(FIXTURES_DIR, "codex-hooks-object");

    test("directory exists", () => {
      expect(existsSync(fixturePath)).toBe(true);
      expect(statSync(fixturePath).isDirectory()).toBe(true);
    });

    test("hooks.json uses object-form hooks keyed by event", () => {
      const hooksPath = join(fixturePath, "hooks.json");
      const json = JSON.parse(readFileSync(hooksPath, "utf-8"));

      expect(json.hooks).toBeDefined();
      expect(Array.isArray(json.hooks)).toBe(false);
      expect(Object.keys(json.hooks)).toEqual(["PostToolUse", "Stop"]);
    });
  });

  describe("codex-hooks-multi fixture", () => {
    const fixturePath = join(FIXTURES_DIR, "codex-hooks-multi");

    test("directory exists", () => {
      expect(existsSync(fixturePath)).toBe(true);
      expect(statSync(fixturePath).isDirectory()).toBe(true);
    });

    test(".codex-plugin/plugin.json exists and points to hooks-multi.json", () => {
      const pluginJsonPath = join(fixturePath, ".codex-plugin", "plugin.json");
      expect(existsSync(pluginJsonPath)).toBe(true);

      const content = readFileSync(pluginJsonPath, "utf-8");
      const json = JSON.parse(content);

      expect(json.hooks).toBe("hooks-multi.json");
    });

    test("hooks-multi.json has multiple hooks for aggregation testing", () => {
      const hooksPath = join(fixturePath, "hooks-multi.json");
      expect(existsSync(hooksPath)).toBe(true);

      const content = readFileSync(hooksPath, "utf-8");
      const json = JSON.parse(content);

      expect(json.hooks).toBeDefined();
      expect(Array.isArray(json.hooks)).toBe(true);
      expect(json.hooks.length).toBeGreaterThanOrEqual(2);

      // Verify events array exists in each hook
      for (const hook of json.hooks) {
        expect(hook.events).toBeDefined();
        expect(Array.isArray(hook.events)).toBe(true);
      }
    });
  });

  describe("codex-no-app fixture", () => {
    const fixturePath = join(FIXTURES_DIR, "codex-no-app");

    test("directory exists", () => {
      expect(existsSync(fixturePath)).toBe(true);
      expect(statSync(fixturePath).isDirectory()).toBe(true);
    });

    test(".codex-plugin/plugin.json exists", () => {
      const pluginJsonPath = join(fixturePath, ".codex-plugin", "plugin.json");
      expect(existsSync(pluginJsonPath)).toBe(true);

      const content = readFileSync(pluginJsonPath, "utf-8");
      JSON.parse(content); // Verify valid JSON
    });

    test("has no .app.json to test compatibility without dropped components", () => {
      const appJsonPath = join(fixturePath, ".app.json");
      expect(existsSync(appJsonPath)).toBe(false);
    });

    test("has hooks and agents for partial compatibility testing", () => {
      const hooksPath = join(fixturePath, "hooks.json");
      expect(existsSync(hooksPath)).toBe(true);

      const agentsDir = join(fixturePath, "agents");
      expect(existsSync(agentsDir)).toBe(true);
      expect(statSync(agentsDir).isDirectory()).toBe(true);
    });
  });

  describe("claude-code-review fixture", () => {
    const fixturePath = join(FIXTURES_DIR, "claude-code-review");

    test("directory exists", () => {
      expect(existsSync(fixturePath)).toBe(true);
      expect(statSync(fixturePath).isDirectory()).toBe(true);
    });

    test(".claude-plugin/plugin.json exists and is valid JSON", () => {
      const pluginJsonPath = join(fixturePath, ".claude-plugin", "plugin.json");
      expect(existsSync(pluginJsonPath)).toBe(true);

      const content = readFileSync(pluginJsonPath, "utf-8");
      const json = JSON.parse(content);

      expect(json.name).toBeDefined();
      expect(json.version).toBeDefined();
      expect(json.description).toBeDefined();
      expect(json.author).toBeDefined();
    });

    test("Claude fixture uses implicit directory convention (no skills field in manifest)", () => {
      const pluginJsonPath = join(fixturePath, ".claude-plugin", "plugin.json");
      const json = JSON.parse(readFileSync(pluginJsonPath, "utf-8"));

      // Claude Code uses implicit convention - skills directory exists but NOT in manifest
      expect(json.skills).toBeUndefined();

      // Verify skills directory exists by convention
      const skillsDir = join(fixturePath, "skills");
      expect(existsSync(skillsDir)).toBe(true);
    });

    test("Claude plugin.json includes license field", () => {
      const pluginJsonPath = join(fixturePath, ".claude-plugin", "plugin.json");
      const json = JSON.parse(readFileSync(pluginJsonPath, "utf-8"));

      expect(json.license).toBeDefined();
    });

    test("skills/code-review/SKILL.md exists", () => {
      const skillPath = join(fixturePath, "skills", "code-review", "SKILL.md");
      expect(existsSync(skillPath)).toBe(true);
    });

    test("skills/code-review/SKILL.md has valid frontmatter", () => {
      const skillPath = join(fixturePath, "skills", "code-review", "SKILL.md");
      expect(validateSkillFrontmatter(skillPath)).toBe(true);
    });

    test("hooks/hooks.json exists", () => {
      const hooksPath = join(fixturePath, "hooks", "hooks.json");
      expect(existsSync(hooksPath)).toBe(true);

      const content = readFileSync(hooksPath, "utf-8");
      JSON.parse(content); // Verify it's valid JSON
    });

    test("hooks/hooks.json uses events array matching HookRef IR schema", () => {
      const hooksPath = join(fixturePath, "hooks", "hooks.json");
      const json = JSON.parse(readFileSync(hooksPath, "utf-8"));

      expect(json.hooks).toBeDefined();
      expect(Array.isArray(json.hooks)).toBe(true);
      expect(json.hooks.length).toBeGreaterThan(0);

      for (const hook of json.hooks) {
        expect(hook.events).toBeDefined();
        expect(Array.isArray(hook.events)).toBe(true);
        expect(hook.events.length).toBeGreaterThan(0);
      }
    });

    test("commands/code-review.md exists with frontmatter", () => {
      const commandPath = join(fixturePath, "commands", "code-review.md");
      expect(existsSync(commandPath)).toBe(true);

      const content = readFileSync(commandPath, "utf-8");
      expect(content).toContain("description:");
      expect(content).toContain("allowed-tools:");
    });

    test(".mcp.json uses top-level mcpServers", () => {
      const mcpPath = join(fixturePath, ".mcp.json");
      const json = JSON.parse(readFileSync(mcpPath, "utf-8"));

      expect(json.mcpServers).toBeDefined();
      expect(json.servers).toBeUndefined();
    });

    test("README.md exists", () => {
      const readmePath = join(fixturePath, "README.md");
      expect(existsSync(readmePath)).toBe(true);
    });
  });

  describe("claude-with-md-commands fixture", () => {
    const fixturePath = join(FIXTURES_DIR, "claude-with-md-commands");

    test("directory exists", () => {
      expect(existsSync(fixturePath)).toBe(true);
      expect(statSync(fixturePath).isDirectory()).toBe(true);
    });

    test("commands directory contains multiple markdown commands", () => {
      const summarizePath = join(fixturePath, "commands", "summarize.md");
      const releaseNotesPath = join(fixturePath, "commands", "release-notes.md");

      expect(existsSync(summarizePath)).toBe(true);
      expect(existsSync(releaseNotesPath)).toBe(true);

      const summarizeContent = readFileSync(summarizePath, "utf-8");
      const releaseNotesContent = readFileSync(releaseNotesPath, "utf-8");
      expect(summarizeContent).toContain("allowed-tools:");
      expect(releaseNotesContent).toContain("allowed-tools:");
    });
  });

  describe("cursor-continual-learning fixture", () => {
    const fixturePath = join(FIXTURES_DIR, "cursor-continual-learning");

    test("directory exists", () => {
      expect(existsSync(fixturePath)).toBe(true);
      expect(statSync(fixturePath).isDirectory()).toBe(true);
    });

    test(".cursor-plugin/plugin.json exists and is valid JSON", () => {
      const pluginJsonPath = join(fixturePath, ".cursor-plugin", "plugin.json");
      expect(existsSync(pluginJsonPath)).toBe(true);

      const content = readFileSync(pluginJsonPath, "utf-8");
      const json = JSON.parse(content);

      expect(json.name).toBeDefined();
      expect(json.version).toBeDefined();
      expect(json.description).toBeDefined();
      expect(json.author).toBeDefined();
    });

    test("plugin.json declares resource paths for adapter parsing", () => {
      const pluginJsonPath = join(fixturePath, ".cursor-plugin", "plugin.json");
      const json = JSON.parse(readFileSync(pluginJsonPath, "utf-8"));

      // Cursor is manifest-driven: should declare key resource paths
      expect(json.skills).toBeDefined();
      expect(json.agents).toBeDefined();
      expect(json.hooks).toBeDefined();

      // Should have mcp or mcpServers field
      const hasMcpConfig = json.mcp !== undefined || json.mcpServers !== undefined;
      expect(hasMcpConfig).toBe(true);
    });

    test("declared resource paths point to existing files and directories", () => {
      const pluginJsonPath = join(fixturePath, ".cursor-plugin", "plugin.json");
      const json = JSON.parse(readFileSync(pluginJsonPath, "utf-8"));

      // Verify skills paths exist
      const skillsArray = Array.isArray(json.skills) ? json.skills : [json.skills];
      for (const skillPath of skillsArray) {
        const fullPath = join(fixturePath, skillPath);
        expect(existsSync(fullPath)).toBe(true);
      }

      // Verify agents paths exist
      const agentsArray = Array.isArray(json.agents) ? json.agents : [json.agents];
      for (const agentPath of agentsArray) {
        const fullPath = join(fixturePath, agentPath);
        expect(existsSync(fullPath)).toBe(true);
      }

      // Verify hooks path exists
      const fullPath = join(fixturePath, json.hooks);
      expect(existsSync(fullPath)).toBe(true);

      // Verify mcp config exists - check the specific field from this fixture
      // This fixture uses json.mcp (string path), not json.mcpServers (object)
      if (typeof json.mcp === "string") {
        const mcpFullPath = join(fixturePath, json.mcp);
        expect(existsSync(mcpFullPath)).toBe(true);
      } else if (typeof json.mcpServers === "string") {
        const mcpFullPath = join(fixturePath, json.mcpServers);
        expect(existsSync(mcpFullPath)).toBe(true);
      } else {
        throw new Error("Neither mcp nor mcpServers is a string path");
      }
    });

    test("skills/learning/SKILL.md exists", () => {
      const skillPath = join(fixturePath, "skills", "learning", "SKILL.md");
      expect(existsSync(skillPath)).toBe(true);
    });

    test("skills/learning/SKILL.md has valid frontmatter", () => {
      const skillPath = join(fixturePath, "skills", "learning", "SKILL.md");
      expect(validateSkillFrontmatter(skillPath)).toBe(true);
    });

    test("agents/learner.md exists", () => {
      const agentsPath = join(fixturePath, "agents", "learner.md");
      expect(existsSync(agentsPath)).toBe(true);
    });

    test("hooks/hooks.json exists", () => {
      const hooksPath = join(fixturePath, "hooks", "hooks.json");
      expect(existsSync(hooksPath)).toBe(true);

      const content = readFileSync(hooksPath, "utf-8");
      JSON.parse(content); // Verify it's valid JSON
    });

    test("hooks/hooks.json uses events array matching HookRef IR schema", () => {
      const hooksPath = join(fixturePath, "hooks", "hooks.json");
      const json = JSON.parse(readFileSync(hooksPath, "utf-8"));

      expect(json.hooks).toBeDefined();
      expect(Array.isArray(json.hooks)).toBe(true);
      expect(json.hooks.length).toBeGreaterThan(0);

      for (const hook of json.hooks) {
        expect(hook.events).toBeDefined();
        expect(Array.isArray(hook.events)).toBe(true);
        expect(hook.events.length).toBeGreaterThan(0);
      }
    });

    test("mcp.json exists at root level", () => {
      const mcpPath = join(fixturePath, "mcp.json");
      expect(existsSync(mcpPath)).toBe(true);

      const content = readFileSync(mcpPath, "utf-8");
      JSON.parse(content); // Verify it's valid JSON
    });

    test("README.md exists", () => {
      const readmePath = join(fixturePath, "README.md");
      expect(existsSync(readmePath)).toBe(true);
    });
  });

  describe("asc-cli-skills fixture", () => {
    const fixturePath = join(FIXTURES_DIR, "asc-cli-skills");

    test("directory exists", () => {
      expect(existsSync(fixturePath)).toBe(true);
      expect(statSync(fixturePath).isDirectory()).toBe(true);
    });

    test("skills directory exists with valid SKILL.md files", () => {
      const usageSkill = join(fixturePath, "skills", "asc-cli-usage", "SKILL.md");
      const releaseSkill = join(fixturePath, "skills", "asc-release-flow", "SKILL.md");

      expect(existsSync(usageSkill)).toBe(true);
      expect(existsSync(releaseSkill)).toBe(true);
      expect(validateSkillFrontmatter(usageSkill)).toBe(true);
      expect(validateSkillFrontmatter(releaseSkill)).toBe(true);
    });

    test("fixture includes repo README, references, and scripts", () => {
      expect(existsSync(join(fixturePath, "README.md"))).toBe(true);
      expect(
        existsSync(
          join(fixturePath, "skills", "asc-cli-usage", "references", "commands.md"),
        ),
      ).toBe(true);
      expect(
        existsSync(
          join(
            fixturePath,
            "skills",
            "asc-release-flow",
            "scripts",
            "check-readiness.sh",
          ),
        ),
      ).toBe(true);
    });
  });
});

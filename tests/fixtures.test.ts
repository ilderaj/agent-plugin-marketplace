import { describe, test, expect } from "bun:test";
import { existsSync, statSync, readFileSync } from "fs";
import { join } from "path";

const FIXTURES_DIR = join(__dirname, "fixtures");

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

    test("plugin.json declares skills array matching fixture structure", () => {
      const pluginJsonPath = join(fixturePath, ".codex-plugin", "plugin.json");
      const json = JSON.parse(readFileSync(pluginJsonPath, "utf-8"));

      expect(json.skills).toBeDefined();
      expect(Array.isArray(json.skills)).toBe(true);
      expect(json.skills.length).toBeGreaterThan(0);

      // Verify declared skill path exists
      for (const skillPath of json.skills) {
        const fullPath = join(fixturePath, skillPath);
        expect(existsSync(fullPath)).toBe(true);
      }
    });

    test("plugin.json declares hooks field for Codex format", () => {
      const pluginJsonPath = join(fixturePath, ".codex-plugin", "plugin.json");
      const json = JSON.parse(readFileSync(pluginJsonPath, "utf-8"));

      // Codex uses root-level hooks.json, but plugin.json should reference it
      expect(json.hooks).toBeDefined();
    });

    test("skills/github/SKILL.md exists", () => {
      const skillPath = join(fixturePath, "skills", "github", "SKILL.md");
      expect(existsSync(skillPath)).toBe(true);
    });

    test("hooks.json exists at root level", () => {
      const hooksPath = join(fixturePath, "hooks.json");
      expect(existsSync(hooksPath)).toBe(true);

      const content = readFileSync(hooksPath, "utf-8");
      JSON.parse(content); // Verify it's valid JSON
    });

    test(".app.json exists", () => {
      const appJsonPath = join(fixturePath, ".app.json");
      expect(existsSync(appJsonPath)).toBe(true);

      const content = readFileSync(appJsonPath, "utf-8");
      JSON.parse(content); // Verify it's valid JSON
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

    test("Claude plugin.json includes platform metadata", () => {
      const pluginJsonPath = join(fixturePath, ".claude-plugin", "plugin.json");
      const json = JSON.parse(readFileSync(pluginJsonPath, "utf-8"));

      // Claude should have basic metadata but follow implicit convention
      expect(json.license).toBeDefined();
    });

    test("skills/code-review/SKILL.md exists", () => {
      const skillPath = join(fixturePath, "skills", "code-review", "SKILL.md");
      expect(existsSync(skillPath)).toBe(true);
    });

    test("hooks/hooks.json exists", () => {
      const hooksPath = join(fixturePath, "hooks", "hooks.json");
      expect(existsSync(hooksPath)).toBe(true);

      const content = readFileSync(hooksPath, "utf-8");
      JSON.parse(content); // Verify it's valid JSON
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

    test("declared resource paths match actual fixture structure", () => {
      const pluginJsonPath = join(fixturePath, ".cursor-plugin", "plugin.json");
      const json = JSON.parse(readFileSync(pluginJsonPath, "utf-8"));

      // Verify skills paths exist
      if (json.skills) {
        const skillsArray = Array.isArray(json.skills) ? json.skills : [json.skills];
        for (const skillPath of skillsArray) {
          const fullPath = join(fixturePath, skillPath);
          expect(existsSync(fullPath)).toBe(true);
        }
      }

      // Verify agents paths exist
      if (json.agents) {
        const agentsArray = Array.isArray(json.agents) ? json.agents : [json.agents];
        for (const agentPath of agentsArray) {
          const fullPath = join(fixturePath, agentPath);
          expect(existsSync(fullPath)).toBe(true);
        }
      }

      // Verify hooks path exists
      if (json.hooks) {
        const fullPath = join(fixturePath, json.hooks);
        expect(existsSync(fullPath)).toBe(true);
      }

      // Verify mcp config exists
      if (json.mcp) {
        const fullPath = join(fixturePath, json.mcp);
        expect(existsSync(fullPath)).toBe(true);
      }
    });

    test("skills/learning/SKILL.md exists", () => {
      const skillPath = join(fixturePath, "skills", "learning", "SKILL.md");
      expect(existsSync(skillPath)).toBe(true);
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

    test("mcp.json exists at root level", () => {
      const mcpPath = join(fixturePath, "mcp.json");
      expect(existsSync(mcpPath)).toBe(true);

      const content = readFileSync(mcpPath, "utf-8");
      JSON.parse(content); // Verify it's valid JSON
    });
  });
});

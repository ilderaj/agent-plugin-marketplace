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

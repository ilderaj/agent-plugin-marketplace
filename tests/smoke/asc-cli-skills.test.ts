import { describe, expect, test } from "bun:test";
import { readFile } from "fs/promises";
import { join } from "path";

const REPO_ROOT = join(import.meta.dir, "../..");

describe("asc cli skills generated plugin", () => {
  test("marketplace includes the generated community plugin", async () => {
    const marketplace = JSON.parse(
      await readFile(join(REPO_ROOT, "marketplace.json"), "utf-8"),
    ) as { plugins: Array<{ name: string }> };

    expect(
      marketplace.plugins.some((plugin) => plugin.name === "community--asc-cli-skills"),
    ).toBe(true);
  });

  test("generated plugin exposes skills only", async () => {
    const manifest = JSON.parse(
      await readFile(
        join(REPO_ROOT, "plugins", "community--asc-cli-skills", "plugin.json"),
        "utf-8",
      ),
    ) as Record<string, unknown>;

    expect(manifest.skills).toBe("./skills/");
    expect(manifest.agents).toBeUndefined();
    expect(manifest.mcpServers).toBeUndefined();
  });
});

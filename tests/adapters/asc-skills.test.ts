import { describe, expect, test } from "bun:test";
import { join } from "path";
import { AscSkillsAdapter } from "../../src/adapters/asc-skills";

const FIXTURE = join(import.meta.dir, "..", "fixtures", "asc-cli-skills");

describe("AscSkillsAdapter", () => {
  test("discovers the repo root as a single plugin", async () => {
    const discovered = await new AscSkillsAdapter().discover(FIXTURE);

    expect(discovered).toEqual([
      expect.objectContaining({
        name: "asc-cli-skills",
        path: FIXTURE,
      }),
    ]);
  });

  test("parses repo-root skills into a synthesized plugin IR", async () => {
    const ir = await new AscSkillsAdapter().parse(FIXTURE);

    expect(ir.source.platform).toBe("community");
    expect(ir.manifest.name).toBe("asc-cli-skills");
    expect(ir.components.skills.map((skill) => skill.name)).toEqual([
      "asc-cli-usage",
      "asc-release-flow",
    ]);
    expect(
      ir.components.skills.find((skill) => skill.name === "asc-release-flow")?.hasScripts,
    ).toBe(true);
    expect(ir.compatibility.warnings).toContain(
      "Requires the `asc` CLI to be installed for most workflows.",
    );
  });
});

import { afterEach, describe, expect, test } from "bun:test";
import { createDefaultSyncConfig } from "../src/index";

const ORIGINAL_ASC_SKILLS_REPO_URL = Bun.env.ASC_SKILLS_REPO_URL;

afterEach(() => {
  if (ORIGINAL_ASC_SKILLS_REPO_URL === undefined) {
    delete Bun.env.ASC_SKILLS_REPO_URL;
    return;
  }

  Bun.env.ASC_SKILLS_REPO_URL = ORIGINAL_ASC_SKILLS_REPO_URL;
});

describe("createDefaultSyncConfig", () => {
  test("includes the ASC skills upstream by default", () => {
    const config = createDefaultSyncConfig("/tmp/agent-plugin-marketplace");

    expect(config.repoUrls.community).toBe(
      "https://github.com/rorkai/app-store-connect-cli-skills.git",
    );
  });

  test("allows overriding the ASC skills upstream via env", () => {
    Bun.env.ASC_SKILLS_REPO_URL = "https://github.com/example/custom-asc-skills.git";

    const config = createDefaultSyncConfig("/tmp/agent-plugin-marketplace");

    expect(config.repoUrls.community).toBe(
      "https://github.com/example/custom-asc-skills.git",
    );
  });
});

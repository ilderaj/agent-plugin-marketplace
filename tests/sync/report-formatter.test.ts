import { describe, expect, test } from "bun:test";
import { formatSyncReportAsMarkdown } from "../../src/sync/report-formatter";
import type { SyncReport } from "../../src/sync/pipeline";

describe("formatSyncReportAsMarkdown", () => {
  test("outputs summary header with updated/total counts", () => {
    const report: SyncReport = { updated: 0, total: 5, added: [], removed: [], changed: [] };
    const md = formatSyncReportAsMarkdown(report);
    expect(md).toContain("## Sync Summary");
    expect(md).toContain("**0 updated** out of 5 total plugins.");
  });

  test("outputs 'No changes detected.' when all diff arrays are empty", () => {
    const report: SyncReport = { updated: 0, total: 3, added: [], removed: [], changed: [] };
    const md = formatSyncReportAsMarkdown(report);
    expect(md).toContain("No changes detected.");
    expect(md).not.toContain("### Added");
    expect(md).not.toContain("### Removed");
    expect(md).not.toContain("### Changed");
  });

  test("outputs Added section when plugins were added", () => {
    const report: SyncReport = {
      updated: 2,
      total: 4,
      added: [
        { name: "my-plugin", platform: "codex" },
        { name: "other-plugin", platform: "cursor" },
      ],
      removed: [],
      changed: [],
    };
    const md = formatSyncReportAsMarkdown(report);
    expect(md).toContain("**2 updated** out of 4 total plugins.");
    expect(md).toContain("### Added (2)");
    expect(md).toContain("`my-plugin` (codex)");
    expect(md).toContain("`other-plugin` (cursor)");
    expect(md).not.toContain("No changes detected.");
  });

  test("outputs Removed section when plugins were removed", () => {
    const report: SyncReport = {
      updated: 0,
      total: 2,
      added: [],
      removed: [{ name: "old-plugin", platform: "claude-code" }],
      changed: [],
    };
    const md = formatSyncReportAsMarkdown(report);
    expect(md).toContain("### Removed (1)");
    expect(md).toContain("`old-plugin` (claude-code)");
    expect(md).not.toContain("No changes detected.");
  });

  test("outputs Changed section when plugins were changed", () => {
    const report: SyncReport = {
      updated: 1,
      total: 3,
      added: [],
      removed: [],
      changed: [{ name: "updated-plugin", platform: "codex" }],
    };
    const md = formatSyncReportAsMarkdown(report);
    expect(md).toContain("### Changed (1)");
    expect(md).toContain("`updated-plugin` (codex)");
    expect(md).not.toContain("No changes detected.");
  });

  test("outputs all three sections when all are non-empty", () => {
    const report: SyncReport = {
      updated: 3,
      total: 5,
      added: [{ name: "new-one", platform: "codex" }],
      removed: [{ name: "gone-one", platform: "cursor" }],
      changed: [{ name: "changed-one", platform: "claude-code" }],
    };
    const md = formatSyncReportAsMarkdown(report);
    expect(md).toContain("### Added (1)");
    expect(md).toContain("### Removed (1)");
    expect(md).toContain("### Changed (1)");
  });
});

import type { SyncReport, SyncReportEntry } from "./pipeline";

export function formatSyncReportAsMarkdown(report: SyncReport): string {
  const lines: string[] = [
    "## Sync Summary",
    "",
    `**${report.updated} updated** out of ${report.total} total plugins.`,
    "",
  ];

  const hasChanges =
    report.added.length > 0 || report.removed.length > 0 || report.changed.length > 0;

  if (!hasChanges) {
    lines.push("No changes detected.");
    return lines.join("\n");
  }

  if (report.added.length > 0) {
    lines.push(`### Added (${report.added.length})`, "");
    for (const entry of report.added) {
      lines.push(`- \`${entry.name}\` (${entry.platform})`);
    }
    lines.push("");
  }

  if (report.removed.length > 0) {
    lines.push(`### Removed (${report.removed.length})`, "");
    for (const entry of report.removed) {
      lines.push(`- \`${entry.name}\` (${entry.platform})`);
    }
    lines.push("");
  }

  if (report.changed.length > 0) {
    lines.push(`### Changed (${report.changed.length})`, "");
    for (const entry of report.changed) {
      lines.push(`- \`${entry.name}\` (${entry.platform})`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

import { cp, mkdir, readFile, writeFile } from 'fs/promises';
import { basename, dirname, join, parse } from 'path';
import type {
  AgentRef,
  Compatibility,
  ComponentCompat,
  DroppedComponent,
  HookRef,
  McpRef,
  PluginIR,
  RuleRef,
} from '../adapters/types';
import type { MetaPluginManifest, OfficialPluginManifest } from './marketplace';

export function normalizeGeneratedPluginName(ir: PluginIR) {
  if (ir.source.platform === 'claude-code') {
    return `claude--${ir.manifest.name}`;
  }

  return `${ir.source.platform}--${ir.manifest.name}`;
}

export function platformLabel(platform: PluginIR['source']['platform']) {
  switch (platform) {
    case 'claude-code':
      return 'Claude Code';
    case 'codex':
      return 'Codex';
    case 'cursor':
      return 'Cursor';
  }
}

export class VsCodePluginGenerator {
  async generate(ir: PluginIR, outDir: string): Promise<void> {
    await mkdir(outDir, { recursive: true });

    const compatibility = this.buildGeneratedCompatibility(ir);

    await this.copySkills(ir, outDir);
    await this.copyAgents(ir, outDir);
    await this.copyCommands(ir, outDir);
    await this.writeHooks(ir, outDir);
    await this.writeMcpConfig(ir, outDir);
    await this.writeInstructions(ir, outDir);

    const official = this.buildOfficialManifest(ir);
    const meta = this.buildMeta(ir, compatibility);
    await writeFile(join(outDir, 'plugin.json'), `${JSON.stringify(official, null, 2)}\n`, 'utf-8');
    await writeFile(join(outDir, '_meta.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf-8');
    await writeFile(join(outDir, 'README.md'), this.buildReadme(ir, meta), 'utf-8');
  }

  private buildOfficialManifest(ir: PluginIR): OfficialPluginManifest {
    const normalizedName = normalizeGeneratedPluginName(ir);

    return {
      name: normalizedName,
      version: ir.manifest.version,
      description: ir.manifest.description,
      author: ir.manifest.author,
      license: ir.manifest.license,
      homepage: ir.manifest.homepage,
      repository: ir.manifest.repository,
      keywords: ir.manifest.keywords,
      tags: ir.manifest.tags,
      category: ir.manifest.category,
      ...(ir.components.skills.length > 0 ? { skills: './skills/' as const } : {}),
      ...(ir.components.agents.length > 0 ? { agents: './agents/' as const } : {}),
      ...(ir.components.hooks.length > 0 ? { hooks: './hooks/hooks.json' as const } : {}),
      ...(ir.components.mcpServers.length > 0 ? { mcpServers: './.mcp.json' as const } : {}),
      strict: false,
    };
  }

  private buildMeta(
    ir: PluginIR,
    compatibility: MetaPluginManifest['_compatibility']
  ): MetaPluginManifest {
    const normalizedName = normalizeGeneratedPluginName(ir);

    return {
      displayName: `${this.humanizeName(ir.manifest.displayName ?? ir.manifest.name)} (from ${platformLabel(ir.source.platform)})`,
      _source: {
        platform: ir.source.platform,
        upstream: ir.source.repoUrl,
        pluginPath: ir.source.pluginRelPath ?? ir.source.pluginPath,
        commitSha: ir.source.commitSha,
        version: ir.source.version,
      },
      _compatibility: compatibility,
    };
  }

  private async copySkills(ir: PluginIR, outDir: string) {
    for (const skill of ir.components.skills) {
      await this.copyPath(join(ir.source.pluginPath, skill.path), join(outDir, skill.path));
    }
  }

  private async copyAgents(ir: PluginIR, outDir: string) {
    // Pre-check for filename collisions among YAML agents before writing anything.
    // Cache parsed results so each file is read and parsed only once.
    const parsedCache = new Map<string, Record<string, string>>();
    const usedFilenames = new Set<string>();
    for (const agent of ir.components.agents) {
      if (agent.format !== 'codex-yaml') continue;
      const sourcePath = join(ir.source.pluginPath, agent.path);
      const raw = await readFile(sourcePath, 'utf-8');
      const parsed = this.parseCodexAgentYaml(raw);
      parsedCache.set(agent.path, parsed);
      const name = parsed.name ?? agent.name;
      const filename = this.sanitizeAgentFilename(name);
      if (usedFilenames.has(filename)) {
        throw new Error(
          `Agent filename collision: two agents both sanitize to "${filename}.md". ` +
            `Rename one of the agents to avoid the conflict.`
        );
      }
      usedFilenames.add(filename);
    }

    for (const agent of ir.components.agents) {
      if (agent.format === 'codex-yaml') {
        await this.convertCodexAgent(ir, agent, outDir, parsedCache.get(agent.path));
      } else {
        await this.copyPath(join(ir.source.pluginPath, agent.path), join(outDir, agent.path));
      }
    }
  }

  private async convertCodexAgent(
    ir: PluginIR,
    agent: AgentRef,
    outDir: string,
    cachedParsed?: Record<string, string>
  ) {
    const parsed = cachedParsed ?? this.parseCodexAgentYaml(
      await readFile(join(ir.source.pluginPath, agent.path), 'utf-8')
    );

    const name = parsed.name ?? agent.name;
    const description = parsed.description ?? '';
    const body = parsed.developer_instructions?.trimEnd() ?? '';

    const frontmatter = [
      '---',
      `name: ${this.yamlQuoteIfNeeded(name)}`,
      description ? `description: ${this.yamlQuoteIfNeeded(description)}` : undefined,
      '---',
    ]
      .filter((line) => line !== undefined)
      .join('\n');

    const content = body
      ? `${frontmatter}\n\n${body}\n`
      : `${frontmatter}\n`;

    // Sanitize to prevent path traversal: take only the last segment and strip leading dots
    const safeFilename = this.sanitizeAgentFilename(name);
    const outputPath = join(outDir, `agents/${safeFilename}.md`);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, content, 'utf-8');
  }

  /** Strips path separators and leading dots so the filename always stays in the agents directory. */
  private sanitizeAgentFilename(name: string): string {
    const base = basename(name.replace(/\\/g, '/'));
    return base.replace(/^\.+/, '') || 'agent';
  }

  /**
   * Quotes a YAML scalar value if it contains characters that would produce invalid
   * or ambiguous YAML when written bare: colons, quotes, newlines, and other
   * indicator characters. Uses double-quote style with minimal escaping.
   */
  private yamlQuoteIfNeeded(value: string): string {
    // YAML 1.1 / 1.2 reserved words that would be parsed as non-string scalars.
    const YAML_RESERVED = new Set([
      'true', 'false', 'null', '~',
      // YAML 1.1 booleans
      'yes', 'no', 'on', 'off',
      'True', 'False', 'Null',
      'Yes', 'No', 'On', 'Off',
      'TRUE', 'FALSE', 'NULL',
      'YES', 'NO', 'ON', 'OFF',
    ]);
    const needsQuoting =
      /[:#"'\n\r\t[\]{},|>&*!%@`]/.test(value) ||
      /^\s|\s$/.test(value) ||
      value === '' ||
      YAML_RESERVED.has(value) ||
      // Integer or float scalars: optional sign, digits, optional decimal
      /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(value) ||
      // Octal / hex / infinity / nan literals used by some YAML parsers
      /^0x[0-9a-fA-F]+$/.test(value) ||
      /^0o[0-7]+$/.test(value) ||
      /^[+-]?(\.inf|\.Inf|\.INF|\.nan|\.NaN|\.NAN)$/.test(value);
    if (!needsQuoting) return value;

    const escaped = value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
    return `"${escaped}"`;
  }

  /**
   * Minimal YAML parser for Codex agent files.
   * Handles top-level string fields, quoted scalars (single or double), and
   * block scalars (| and >). Chomping modifiers `|-` / `>-` (strip) are
   * recognised syntactically; in practice all trailing blank lines are removed
   * (strip behaviour). Keep (`|+` / `>+`) is not implemented.
   * Does not support the full YAML spec — only what Codex agent definitions use.
   */
  private parseCodexAgentYaml(raw: string): Record<string, string> {
    const result: Record<string, string> = {};
    const lines = raw.split('\n');
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const topLevelMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)/);

      if (!topLevelMatch) {
        i++;
        continue;
      }

      const key = topLevelMatch[1];
      const valueRaw = topLevelMatch[2].trim();

      if (/^[|>][+-]?$/.test(valueRaw)) {
        const isFolded = valueRaw.startsWith('>');
        // Collect raw indented lines (empty lines are part of block content)
        i++;
        const rawBodyLines: string[] = [];
        while (i < lines.length) {
          const bodyLine = lines[i];
          if (bodyLine === '' || bodyLine.startsWith(' ') || bodyLine.startsWith('\t')) {
            rawBodyLines.push(bodyLine);
            i++;
          } else {
            break;
          }
        }
        // Detect indentation level from the first non-empty line
        let indent = 0;
        for (const rawLine of rawBodyLines) {
          if (rawLine.trim() !== '') {
            const m = rawLine.match(/^(\s+)/);
            indent = m ? m[1].length : 0;
            break;
          }
        }
        const bodyLines = rawBodyLines.map((l) => (l.length === 0 ? '' : l.slice(indent)));
        // Strip trailing blank lines (strip-chomping behaviour for all variants)
        while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1].trim() === '') {
          bodyLines.pop();
        }
        result[key] = isFolded ? this.foldBlockScalar(bodyLines) : bodyLines.join('\n');
      } else if (/^"(.*)"$/.test(valueRaw)) {
        // Double-quoted scalar: unwrap and unescape standard YAML escapes
        result[key] = valueRaw.slice(1, -1)
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\')
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t');
        i++;
      } else if (/^'(.*)'$/.test(valueRaw)) {
        // Single-quoted scalar: unwrap and unescape '' → '
        result[key] = valueRaw.slice(1, -1).replace(/''/g, "'");
        i++;
      } else if (valueRaw !== '' && !valueRaw.startsWith('-')) {
        result[key] = valueRaw;
        i++;
      } else {
        i++;
      }
    }

    return result;
  }

  /**
   * Folds a YAML folded block scalar: consecutive non-empty lines are joined
   * with a single space; blank lines become literal newlines.
   */
  private foldBlockScalar(lines: string[]): string {
    const parts: string[] = [];
    const buf: string[] = [];
    for (const line of lines) {
      if (line.trim() === '') {
        if (buf.length > 0) {
          parts.push(buf.join(' '));
          buf.length = 0;
        }
        parts.push('');
      } else {
        buf.push(line);
      }
    }
    if (buf.length > 0) parts.push(buf.join(' '));
    return parts.join('\n');
  }

  private async copyCommands(ir: PluginIR, outDir: string) {
    for (const command of ir.components.commands) {
      await this.copyPath(join(ir.source.pluginPath, command.path), join(outDir, command.path));
    }
  }

  private async writeHooks(ir: PluginIR, outDir: string) {
    if (ir.components.hooks.length === 0) {
      return;
    }

    const hook = ir.components.hooks[0];
    const outputPath = join(outDir, 'hooks', 'hooks.json');
    await mkdir(dirname(outputPath), { recursive: true });

    const payload = await this.resolveJsonSource(ir, hook.configPath, 'hooks');
    await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  }

  private async writeMcpConfig(ir: PluginIR, outDir: string) {
    if (ir.components.mcpServers.length === 0) {
      return;
    }

    const payload = await this.resolveMcpSource(ir, ir.components.mcpServers[0]);
    await writeFile(join(outDir, '.mcp.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  }

  private async writeInstructions(ir: PluginIR, outDir: string) {
    if (ir.components.rules.length === 0) {
      return;
    }

    const instructionsDir = join(outDir, 'instructions');
    await mkdir(instructionsDir, { recursive: true });

    for (const rule of ir.components.rules) {
      const sourcePath = join(ir.source.pluginPath, rule.path);
      const content = await readFile(sourcePath, 'utf-8');
      const outputName = `${parse(rule.path).name}.instructions.md`;
      await writeFile(
        join(instructionsDir, outputName),
        this.convertRuleToInstruction(rule, content),
        'utf-8'
      );
    }
  }

  private async copyPath(sourcePath: string, destinationPath: string) {
    await mkdir(dirname(destinationPath), { recursive: true });
    await cp(sourcePath, destinationPath, { recursive: true });
  }

  private async resolveJsonSource(ir: PluginIR, configPath: string, fallbackKey: 'hooks') {
    if (configPath.includes('#')) {
      const raw = ir.manifest.raw as Record<string, unknown>;
      return raw[fallbackKey];
    }

    return JSON.parse(await readFile(join(ir.source.pluginPath, configPath), 'utf-8'));
  }

  private async resolveMcpSource(ir: PluginIR, ref: McpRef) {
    if (!ref.configPath.includes('#')) {
      return JSON.parse(await readFile(join(ir.source.pluginPath, ref.configPath), 'utf-8'));
    }

    const raw = ir.manifest.raw as Record<string, unknown>;
    if (ref.configPath.includes('#mcpServers')) {
      return {
        mcpServers: raw.mcpServers,
      };
    }

    return raw.mcp;
  }

  private convertRuleToInstruction(rule: RuleRef, content: string) {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?/);
    const body = frontmatterMatch ? content.slice(frontmatterMatch[0].length).trimStart() : content;
    const descriptionMatch = frontmatterMatch?.[1].match(/^description:\s*(.+)$/m);
    const description = descriptionMatch?.[1]?.trim();
    const applyTo = rule.alwaysApply ? 'always' : (rule.globs ?? []).join(', ');

    const header = [
      '---',
      'source: cursor-rule',
      description ? `description: ${description}` : undefined,
      applyTo ? `applyTo: ${applyTo}` : undefined,
      '---',
      '',
      '<!-- Converted from Cursor .mdc rule to VS Code .instructions.md -->',
      '',
    ]
      .filter(Boolean)
      .join('\n');

    return `${header}${body.endsWith('\n') ? body : `${body}\n`}`;
  }

  private buildGeneratedCompatibility(ir: PluginIR): MetaPluginManifest['_compatibility'] {
    const droppedComponents = [...ir.compatibility.droppedComponents];
    const notes = this.summarizeCompatibility(ir.compatibility.details, droppedComponents, ir);
    const warnings = [...ir.compatibility.warnings];

    if (ir.components.commands.length > 0) {
      warnings.push('Command files were copied to the output plugin and require manual verification in VS Code.');
    }

    return {
      overall: this.pickWorstLevel([
        ir.compatibility.overall,
        droppedComponents.length > 0 ? 'partial' : 'full',
      ]),
      notes,
      warnings,
      droppedComponents,
    };
  }

  private summarizeCompatibility(
    details: ComponentCompat[],
    droppedComponents: DroppedComponent[],
    ir: PluginIR
  ) {
    const notes: string[] = [];
    const byType = new Map<string, ComponentCompat[]>();

    for (const detail of details) {
      if (detail.type === 'rule' || detail.type === 'command') {
        continue;
      }
      const bucket = byType.get(detail.type) ?? [];
      bucket.push(detail);
      byType.set(detail.type, bucket);
    }

    for (const [type, entries] of byType) {
      const level = this.pickWorstLevel(entries.map((entry) => entry.level));
      const note = entries[0]?.notes;
      notes.push(`${this.labelForType(type)}: ${level}${note ? ` — ${note}` : ''}`);
    }

    if (ir.components.rules.length > 0) {
      notes.push('Rules: partial — converted to VS Code `.instructions.md` files');
    }

    if (ir.components.commands.length > 0) {
      notes.push('Commands: partial — copied to output and require manual verification in VS Code');
    }

    for (const dropped of droppedComponents) {
      notes.push(`${this.labelForType(dropped.type)}: unsupported — ${dropped.reason}`);
    }

    return Array.from(new Set(notes));
  }

  private pickWorstLevel(levels: ComponentCompat['level'][]) {
    const order: Record<ComponentCompat['level'], number> = {
      unsupported: 3,
      degraded: 2,
      partial: 1,
      full: 0,
    };

    return levels.reduce((worst, current) => (order[current] > order[worst] ? current : worst), 'full');
  }

  private buildReadme(ir: PluginIR, meta: MetaPluginManifest) {
    const componentLines = [
      ir.components.skills.length > 0 ? `- Skills: ${ir.components.skills.map((skill) => skill.name).join(', ')}` : '- Skills: none',
      ir.components.agents.length > 0 ? `- Agents: ${ir.components.agents.map((agent) => basename(agent.path)).join(', ')}` : '- Agents: none',
      ir.components.hooks.length > 0 ? `- Hooks: hooks/hooks.json (${ir.components.hooks[0].events.join(', ')})` : '- Hooks: none',
      ir.components.mcpServers.length > 0
        ? `- MCP: ${ir.components.mcpServers.flatMap((ref) => ref.servers.map((server) => server.name)).join(', ')}`
        : '- MCP: none',
      ir.components.commands.length > 0
        ? `- Commands: ${ir.components.commands.map((command) => basename(command.path)).join(', ')}`
        : '- Commands: none',
      ir.components.rules.length > 0
        ? `- Instructions: ${ir.components.rules.map((rule) => `${parse(rule.path).name}.instructions.md`).join(', ')}`
        : '- Instructions: none',
    ];

    const droppedLines =
      meta._compatibility.droppedComponents.length > 0
        ? meta._compatibility.droppedComponents.map(
            (component) => `- ${this.labelForType(component.type)}: ${component.reason}`
          )
        : ['- None'];

    return [
      `# ${meta.displayName}`,
      '',
      '## Source',
      `- Platform: ${ir.source.platform}`,
      `- Plugin ID: ${ir.id}`,
      `- Upstream: ${ir.source.repoUrl}`,
      `- Source Path: ${ir.source.pluginPath}`,
      `- Version: ${ir.source.version}`,
      '',
      '## Compatibility Summary',
      `- Overall: ${meta._compatibility.overall}`,
      ...meta._compatibility.notes.map((note) => `- ${note}`),
      ...meta._compatibility.warnings.map((warning) => `- Warning: ${warning}`),
      '',
      '## Components',
      ...componentLines,
      '',
      '## Dropped Components',
      ...droppedLines,
      '',
      '## Notes',
      ir.components.rules.length > 0
        ? '- Cursor rules were converted to VS Code `.instructions.md` files instead of being copied verbatim.'
        : '- No additional conversion notes.',
      ir.components.commands.length > 0
        ? '- Command files were copied to the generated plugin, but they require manual verification in VS Code.'
        : '- No command files required manual verification.',
      meta._compatibility.droppedComponents.some((component) => component.type === 'app')
        ? '- Codex `.app.json` support is not available in VS Code and was omitted from the generated plugin.'
        : '- No platform-specific app connectors were dropped.',
      '',
    ].join('\n');
  }

  private humanizeName(name: string) {
    const normalized = name
      .split(/[\s-_]+/)
      .filter(Boolean)
      .map((segment) => {
        const lower = segment.toLowerCase();
        if (lower === 'github') {
          return 'GitHub';
        }
        if (lower === 'vscode') {
          return 'VS Code';
        }
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      });

    return normalized.join(' ');
  }

  private labelForType(type: string) {
    switch (type) {
      case 'mcp-server':
        return 'MCP';
      case 'rule':
        return 'Rules';
      case 'app':
        return '.app.json';
      case 'command':
        return 'Commands';
      default:
        return type.charAt(0).toUpperCase() + type.slice(1);
    }
  }
}

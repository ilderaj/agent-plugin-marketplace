import { readdir, readFile, stat } from 'fs/promises';
import { join, relative } from 'path';
import type {
  SourceAdapter,
  DiscoveredPlugin,
  PluginIR,
  SourceInfo,
  ManifestInfo,
  Components,
  Compatibility,
  CompatLevel,
  ComponentCompat,
  DroppedComponent,
  SkillRef,
  HookRef,
  AgentRef,
  CommandRef,
  McpRef,
  RuleRef,
} from './types';

export class CursorAdapter implements SourceAdapter {
  readonly platform = 'cursor' as const;
  readonly markerDir = '.cursor-plugin';

  async discover(repoPath: string): Promise<DiscoveredPlugin[]> {
    const plugins: DiscoveredPlugin[] = [];

    try {
      const entries = await readdir(repoPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const pluginPath = join(repoPath, entry.name);
        const markerPath = join(pluginPath, this.markerDir);

        try {
          const markerStat = await stat(markerPath);
          if (!markerStat.isDirectory()) {
            continue;
          }

          await stat(join(markerPath, 'plugin.json'));
          plugins.push({
            name: entry.name,
            path: pluginPath,
            markerPath,
          });
        } catch (err: any) {
          if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
            throw err;
          }
        }
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
        throw err;
      }
    }

    return plugins;
  }

  async parse(pluginDir: string): Promise<PluginIR> {
    const pluginJsonPath = join(pluginDir, this.markerDir, 'plugin.json');
    const pluginJsonContent = await readFile(pluginJsonPath, 'utf-8');
    const pluginJson = JSON.parse(pluginJsonContent);

    const manifest = this.parseManifest(pluginJson);
    const components: Components = {
      skills: await this.parseSkills(pluginDir, pluginJson),
      hooks: await this.parseHooks(pluginDir, pluginJson),
      agents: await this.parseAgents(pluginDir, pluginJson),
      commands: await this.parseCommands(pluginDir, pluginJson),
      mcpServers: await this.parseMcpServers(pluginDir, pluginJson),
      rules: await this.parseRules(pluginDir, pluginJson),
      apps: [],
    };

    const source: SourceInfo = {
      platform: this.platform,
      repoUrl: manifest.repository || 'unknown',
      pluginPath: pluginDir,
      commitSha: 'unknown',
      version: manifest.version,
    };

    return {
      id: `${this.platform}--${manifest.name}`,
      source,
      manifest,
      components,
      compatibility: this.computeCompatibility(components),
    };
  }

  private parseManifest(pluginJson: any): ManifestInfo {
    return {
      name: pluginJson.name,
      displayName: pluginJson.displayName,
      version: pluginJson.version ?? '0.0.0',
      description: pluginJson.description,
      author: pluginJson.author,
      license: pluginJson.license,
      homepage: pluginJson.homepage,
      repository: pluginJson.repository,
      keywords: pluginJson.keywords,
      tags: pluginJson.tags,
      category: pluginJson.category,
      logo: pluginJson.logo,
      raw: pluginJson,
    };
  }

  private async parseSkills(pluginDir: string, pluginJson: any): Promise<SkillRef[]> {
    const skills: SkillRef[] = [];

    for (const skillPath of await this.resolveSkillPaths(pluginDir, pluginJson.skills)) {
      const scriptsPath = join(pluginDir, skillPath, 'scripts');
      let hasScripts = false;

      try {
        hasScripts = (await stat(scriptsPath)).isDirectory();
      } catch (err: any) {
        if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
          throw err;
        }
      }

      skills.push({
        name: skillPath.split('/').pop() || skillPath,
        path: skillPath,
        hasScripts,
      });
    }

    return skills;
  }

  private async parseHooks(pluginDir: string, pluginJson: any): Promise<HookRef[]> {
    const hooks: HookRef[] = [];

    if (typeof pluginJson.hooks === 'string') {
      try {
        const hooksJson = JSON.parse(await readFile(join(pluginDir, pluginJson.hooks), 'utf-8'));
        const hookRef = this.buildHookRef(pluginJson.hooks, hooksJson);
        if (hookRef) {
          hooks.push(hookRef);
        }
      } catch (err: any) {
        if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
          throw err;
        }
      }
    } else if (pluginJson.hooks && typeof pluginJson.hooks === 'object') {
      const hookRef = this.buildHookRef('.cursor-plugin/plugin.json#hooks', pluginJson.hooks);
      if (hookRef) {
        hooks.push(hookRef);
      }
    }

    return hooks;
  }

  private async parseAgents(pluginDir: string, pluginJson: any): Promise<AgentRef[]> {
    return (await this.resolveDirectoryEntries(pluginDir, pluginJson.agents, {
      include: (entry) => entry.isFile() && entry.name.endsWith('.md'),
    })).map((agentPath) => {
      const fileName = agentPath.split('/').pop() || agentPath;
      return {
        name: fileName.replace(/\.md$/, ''),
        path: agentPath,
        format: 'cursor-md' as const,
      };
    });
  }

  private async parseCommands(pluginDir: string, pluginJson: any): Promise<CommandRef[]> {
    return (await this.resolveDirectoryEntries(pluginDir, pluginJson.commands, {
      include: (entry) =>
        entry.isFile() && (entry.name.endsWith('.sh') || entry.name.endsWith('.js') || entry.name.endsWith('.ts')),
    })).map((commandPath) => ({
      name: commandPath.split('/').pop() || commandPath,
      path: commandPath,
    }));
  }

  private async parseRules(pluginDir: string, pluginJson: any): Promise<RuleRef[]> {
    const rules: RuleRef[] = [];

    for (const rulePath of await this.resolveDirectoryEntries(pluginDir, pluginJson.rules, {
      include: (entry) => entry.isFile() && entry.name.endsWith('.mdc'),
    })) {
      try {
        const ruleContent = await readFile(join(pluginDir, rulePath), 'utf-8');
        const { alwaysApply, globs } = this.parseRuleFrontmatter(ruleContent, rulePath);
        rules.push({ path: rulePath, alwaysApply, globs });
      } catch (err: any) {
        if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
          throw err;
        }
      }
    }

    return rules;
  }

  private async parseMcpServers(pluginDir: string, pluginJson: any): Promise<McpRef[]> {
    const refs: McpRef[] = [];
    const pathSpecs = [
      ...this.asPathList(pluginJson.mcp),
      ...(typeof pluginJson.mcpServers === 'string' ? [pluginJson.mcpServers] : []),
      ...(Array.isArray(pluginJson.mcpServers)
        ? pluginJson.mcpServers.filter((entry: unknown): entry is string => typeof entry === 'string')
        : []),
    ];

    for (const configPath of pathSpecs) {
      try {
        const mcpJson = JSON.parse(await readFile(join(pluginDir, configPath), 'utf-8'));
        const ref = this.buildMcpRef(configPath, mcpJson);
        if (ref) {
          refs.push(ref);
        }
      } catch (err: any) {
        if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
          throw err;
        }
      }
    }

    if (pluginJson.mcpServers && typeof pluginJson.mcpServers === 'object') {
      if (Array.isArray(pluginJson.mcpServers)) {
        pluginJson.mcpServers.forEach((entry: unknown, index: number) => {
          if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
            const ref = this.buildMcpRef(
              `.cursor-plugin/plugin.json#mcpServers[${index}]`,
              { mcpServers: entry }
            );
            if (ref) {
              refs.push(ref);
            }
          }
        });
      } else {
        const ref = this.buildMcpRef('.cursor-plugin/plugin.json#mcpServers', {
          mcpServers: pluginJson.mcpServers,
        });
        if (ref) {
          refs.push(ref);
        }
      }
    }

    return refs;
  }

  private asPathList(value: unknown): string[] {
    if (typeof value === 'string') {
      return [value];
    }
    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === 'string');
    }
    return [];
  }

  private async resolveSkillPaths(pluginDir: string, value: unknown): Promise<string[]> {
    const resolved: string[] = [];

    for (const pathSpec of this.asPathList(value)) {
      const fullPath = join(pluginDir, pathSpec);
      const pathStat = await stat(fullPath);

      if (!pathStat.isDirectory()) {
        resolved.push(this.toRelativePluginPath(pluginDir, fullPath));
        continue;
      }

      try {
        const skillManifest = join(fullPath, 'SKILL.md');
        const skillManifestStat = await stat(skillManifest);
        if (skillManifestStat.isFile()) {
          resolved.push(this.toRelativePluginPath(pluginDir, fullPath));
          continue;
        }
      } catch (err: any) {
        if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
          throw err;
        }
      }

      const entries = await readdir(fullPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          resolved.push(this.toRelativePluginPath(pluginDir, join(fullPath, entry.name)));
        }
      }
    }

    return resolved;
  }

  private async resolveDirectoryEntries(
    pluginDir: string,
    value: unknown,
    options: { include: (entry: { isFile(): boolean; name: string }) => boolean },
  ): Promise<string[]> {
    const resolved: string[] = [];

    for (const pathSpec of this.asPathList(value)) {
      const fullPath = join(pluginDir, pathSpec);
      const pathStat = await stat(fullPath);

      if (!pathStat.isDirectory()) {
        resolved.push(this.toRelativePluginPath(pluginDir, fullPath));
        continue;
      }

      const entries = await readdir(fullPath, { withFileTypes: true });
      for (const entry of entries) {
        const normalizedEntry = { isFile: () => entry.isFile(), name: entry.name as string };
        if (options.include(normalizedEntry)) {
          resolved.push(this.toRelativePluginPath(pluginDir, join(fullPath, normalizedEntry.name)));
        }
      }
    }

    return resolved;
  }

  private toRelativePluginPath(pluginDir: string, fullPath: string): string {
    return relative(pluginDir, fullPath).replace(/\\/g, '/');
  }

  private buildHookRef(configPath: string, hooksJson: any): HookRef | null {
    if (!hooksJson?.hooks || !Array.isArray(hooksJson.hooks)) {
      return null;
    }

    const events = new Set<string>();
    for (const hook of hooksJson.hooks) {
      if (!hook?.events || !Array.isArray(hook.events)) {
        continue;
      }
      for (const event of hook.events) {
        if (typeof event === 'string') {
          events.add(event);
        }
      }
    }

    return {
      configPath,
      events: Array.from(events),
      format: 'cursor',
    };
  }

  private parseRuleFrontmatter(
    ruleContent: string,
    rulePath: string
  ): { alwaysApply: boolean; globs?: string[] } {
    const frontmatterMatch = ruleContent.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      throw new Error(`Invalid rule file: missing frontmatter in ${rulePath}`);
    }

    let alwaysApply = false;
    let globs: string[] | undefined;
    let readingGlobs = false;

    for (const rawLine of frontmatterMatch[1].split('\n')) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }
      if (line.includes('{') || line.includes('}')) {
        throw new Error(`Invalid YAML in frontmatter: ${rulePath}`);
      }
      if (line.startsWith('alwaysApply:')) {
        const value = line.slice('alwaysApply:'.length).trim();
        if (value !== 'true' && value !== 'false') {
          throw new Error(`Invalid alwaysApply in frontmatter: ${rulePath}`);
        }
        alwaysApply = value === 'true';
        readingGlobs = false;
        continue;
      }
      if (line === 'globs:') {
        globs = [];
        readingGlobs = true;
        continue;
      }
      if (line.startsWith('description:')) {
        readingGlobs = false;
        continue;
      }
      if (readingGlobs) {
        if (!line.startsWith('- ')) {
          throw new Error(`Invalid globs entry in frontmatter: ${rulePath}`);
        }
        const glob = line.slice(2).trim().replace(/^['"]|['"]$/g, '');
        if (!glob) {
          throw new Error(`Invalid globs entry in frontmatter: ${rulePath}`);
        }
        if (!globs) {
          globs = [];
        }
        globs.push(glob);
        continue;
      }
      throw new Error(`Unsupported rule frontmatter in ${rulePath}`);
    }

    return {
      alwaysApply,
      globs: globs && globs.length > 0 ? globs : undefined,
    };
  }

  private buildMcpRef(configPath: string, config: any): McpRef | null {
    if (!config?.mcpServers || typeof config.mcpServers !== 'object') {
      return null;
    }

    const servers = Object.entries(config.mcpServers).map(([name, serverConfig]) => ({
      name,
      transport: (serverConfig as any).transport || 'stdio',
    }));

    if (servers.length === 0) {
      return null;
    }

    return {
      configPath,
      servers,
    };
  }

  private computeCompatibility(components: Components): Compatibility {
    const details: ComponentCompat[] = [];
    const warnings: string[] = [];
    const droppedComponents: DroppedComponent[] = [];

    for (const skill of components.skills) {
      details.push({
        type: 'skill',
        name: skill.name,
        level: 'full' as const,
        notes: 'Skills are cross-platform compatible',
      });
    }

    for (const hook of components.hooks) {
      details.push({
        type: 'hook',
        name: hook.configPath,
        level: 'partial' as const,
        notes: 'Hooks require format conversion for other platforms',
      });
    }

    for (const agent of components.agents) {
      details.push({
        type: 'agent',
        name: agent.name,
        level: 'partial' as const,
        notes: 'Agent definitions require format conversion',
      });
    }

    for (const command of components.commands) {
      details.push({
        type: 'command',
        name: command.name,
        level: 'partial' as const,
        notes: 'Platform-specific scripts (.sh/.js/.ts) copied to output; no direct VS Code command equivalent',
      });
    }

    for (const rule of components.rules) {
      details.push({
        type: 'rule',
        name: rule.path,
        level: 'partial' as const,
        notes: 'Cursor .mdc rules require conversion to VS Code .instructions.md files',
      });
    }

    if (components.rules.length > 0) {
      warnings.push('Cursor .mdc rules require conversion to VS Code .instructions.md files');
    }

    for (const mcp of components.mcpServers) {
      for (const server of mcp.servers) {
        details.push({
          type: 'mcp-server',
          name: server.name,
          level: 'full' as const,
          notes: 'MCP servers are cross-platform compatible',
        });
      }
    }

    const hasPartialOrDegraded = details.some(
      (detail) => detail.level === 'partial' || detail.level === 'degraded'
    );
    const hasDropped = droppedComponents.length > 0;
    const overall: CompatLevel = hasPartialOrDegraded || hasDropped ? 'partial' : 'full';

    return {
      overall,
      details,
      warnings,
      droppedComponents,
    };
  }
}

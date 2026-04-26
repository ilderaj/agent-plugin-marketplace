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
  AppRef,
  McpRef,
} from './types';

export class CodexAdapter implements SourceAdapter {
  readonly platform = 'codex' as const;
  readonly markerDir = '.codex-plugin';

  async discover(repoPath: string): Promise<DiscoveredPlugin[]> {
    const plugins: DiscoveredPlugin[] = [];
    
    try {
      const entries = await readdir(repoPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pluginPath = join(repoPath, entry.name);
          const markerPath = join(pluginPath, this.markerDir);
          
          try {
            const markerStat = await stat(markerPath);
            if (markerStat.isDirectory()) {
              const pluginJsonPath = join(markerPath, 'plugin.json');
              await stat(pluginJsonPath);
              
              plugins.push({
                name: entry.name,
                path: pluginPath,
                markerPath,
              });
            }
          } catch (err: any) {
            // Skip only if marker/plugin.json doesn't exist (expected)
            if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
              throw err;
            }
          }
        }
      }
    } catch (err: any) {
      // Return empty array only if repo directory doesn't exist (expected)
      if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
        throw err;
      }
    }
    
    return plugins;
  }

  async parse(pluginDir: string): Promise<PluginIR> {
    const markerPath = join(pluginDir, this.markerDir);
    const pluginJsonPath = join(markerPath, 'plugin.json');
    
    const pluginJsonContent = await readFile(pluginJsonPath, 'utf-8');
    const pluginJson = JSON.parse(pluginJsonContent);
    
    const manifest = this.parseManifest(pluginJson);
    const skills = await this.parseSkills(pluginDir, pluginJson);
    const hooks = await this.parseHooks(pluginDir, pluginJson);
    const agents = await this.parseAgents(pluginDir);
    const apps = await this.parseApps(pluginDir);
    const mcpServers = await this.parseMcpServers(pluginDir);
    
    const components: Components = {
      skills,
      hooks,
      agents,
      commands: [],
      mcpServers,
      rules: [],
      apps,
    };
    
    const compatibility = this.computeCompatibility(components);
    
    const source: SourceInfo = {
      platform: this.platform,
      repoUrl: manifest.repository || 'unknown',
      pluginPath: pluginDir,
      commitSha: 'unknown',
      version: manifest.version,
    };
    
    const id = `${this.platform}--${manifest.name}`;
    
    return {
      id,
      source,
      manifest,
      components,
      compatibility,
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
      const fullPath = join(pluginDir, skillPath);
      const scriptsPath = join(fullPath, 'scripts');

      let hasScripts = false;
      try {
        const scriptsStat = await stat(scriptsPath);
        hasScripts = scriptsStat.isDirectory();
      } catch (err: any) {
        // Only ignore if scripts directory doesn't exist (optional)
        if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
          throw err;
        }
      }

      const name = skillPath.split('/').pop() || skillPath;

      skills.push({
        name,
        path: skillPath,
        hasScripts,
      });
    }

    return skills;
  }

  private async parseHooks(pluginDir: string, pluginJson: any): Promise<HookRef[]> {
    const hooks: HookRef[] = [];
    
    if (pluginJson.hooks) {
      const hooksPath = join(pluginDir, pluginJson.hooks);
      
      try {
        const hooksContent = await readFile(hooksPath, 'utf-8');
        const hooksJson = JSON.parse(hooksContent);
        
        const hookRef = this.buildHookRef(pluginJson.hooks, hooksJson);
        if (hookRef) {
          hooks.push(hookRef);
        }
      } catch (err: any) {
        // Only ignore if hooks file doesn't exist (optional component)
        if (err.code !== 'ENOENT') {
          throw err;
        }
      }
    }
    
    return hooks;
  }

  private async parseAgents(pluginDir: string): Promise<AgentRef[]> {
    const agents: AgentRef[] = [];
    const agentsPath = join(pluginDir, 'agents');
    
    try {
      const agentsStat = await stat(agentsPath);
      if (agentsStat.isDirectory()) {
        const entries = await readdir(agentsPath, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))) {
            const name = entry.name.replace(/\.ya?ml$/, '');
            agents.push({
              name,
              path: `agents/${entry.name}`,
              format: 'codex-yaml',
            });
          }
        }
      }
    } catch (err: any) {
      // Only ignore if agents directory doesn't exist (optional component)
      if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
        throw err;
      }
    }
    
    return agents;
  }

  private async parseApps(pluginDir: string): Promise<AppRef[]> {
    const apps: AppRef[] = [];
    const appJsonPath = join(pluginDir, '.app.json');
    
    try {
      const appJsonContent = await readFile(appJsonPath, 'utf-8');
      const appJson = JSON.parse(appJsonContent);
      
      apps.push({
        configPath: '.app.json',
        description: appJson.description || `App config: ${appJson.appId}`,
      });
    } catch (err: any) {
      // Only ignore if .app.json doesn't exist (optional component)
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
    
    return apps;
  }

  private async parseMcpServers(pluginDir: string): Promise<McpRef[]> {
    const mcpServers: McpRef[] = [];
    const mcpJsonPath = join(pluginDir, '.mcp.json');
    
    try {
      const mcpJsonContent = await readFile(mcpJsonPath, 'utf-8');
      const mcpJson = JSON.parse(mcpJsonContent);
      
      const serverMap = mcpJson.mcpServers && typeof mcpJson.mcpServers === 'object'
        ? mcpJson.mcpServers
        : mcpJson.servers;

      const servers = [];
      if (serverMap && typeof serverMap === 'object') {
        for (const [name, config] of Object.entries(serverMap)) {
          const serverConfig = config as any;
          servers.push({
            name,
            transport: serverConfig.transport || serverConfig.type || 'stdio',
          });
        }
      }
      
      if (servers.length > 0) {
        mcpServers.push({
          configPath: '.mcp.json',
          servers,
        });
      }
    } catch (err: any) {
      // Only ignore if .mcp.json doesn't exist (optional component)
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
    
    return mcpServers;
  }

  private computeCompatibility(components: Components): Compatibility {
    const details: ComponentCompat[] = [];
    const warnings: string[] = [];
    const droppedComponents: DroppedComponent[] = [];
    
    // Skills are fully compatible
    for (const skill of components.skills) {
      details.push({
        type: 'skill',
        name: skill.name,
        level: 'full' as const,
        notes: 'Skills are cross-platform compatible',
      });
    }
    
    // Hooks need format conversion
    for (const hook of components.hooks) {
      details.push({
        type: 'hook',
        name: hook.configPath,
        level: 'partial' as const,
        notes: 'Codex hooks require format conversion; limited to 5 events with Bash-only tool interception',
      });
    }
    
    // Agents need format conversion
    for (const agent of components.agents) {
      details.push({
        type: 'agent',
        name: agent.name,
        level: 'partial' as const,
        notes: 'Codex YAML agents are converted to markdown with frontmatter (name, description) and body (developer_instructions). Fields sandbox_mode and nickname_candidates have no VS Code equivalent and are omitted.',
      });
    }
    
    // Apps are Codex-only
    for (const app of components.apps) {
      droppedComponents.push({
        type: 'app',
        reason: 'App connectors are Codex-specific and not supported on other platforms',
      });
      warnings.push('App connector will be dropped when converting to other platforms');
    }
    
    // MCP servers are cross-platform
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
    
    // Compute overall compatibility
    const hasPartialOrDegraded = details.some(d => d.level === 'partial' || d.level === 'degraded');
    const hasDropped = droppedComponents.length > 0;
    const overall: CompatLevel = (hasPartialOrDegraded || hasDropped) ? 'partial' : 'full';
    
    return {
      overall,
      details,
      warnings,
      droppedComponents,
    };
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
      let pathStat;
      try {
        pathStat = await stat(fullPath);
      } catch (err: any) {
        if (err.code === 'ENOENT' || err.code === 'ENOTDIR') {
          continue;
        }
        throw err;
      }

      if (!pathStat.isDirectory()) {
        continue;
      }

      try {
        const manifestPath = join(fullPath, 'SKILL.md');
        const manifestStat = await stat(manifestPath);
        if (manifestStat.isFile()) {
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

  private toRelativePluginPath(pluginDir: string, fullPath: string): string {
    return relative(pluginDir, fullPath).replace(/\\/g, '/');
  }

  private buildHookRef(configPath: string, hooksJson: any): HookRef | null {
    if (!hooksJson?.hooks || typeof hooksJson.hooks !== 'object') {
      return null;
    }

    const allEvents = new Set<string>();

    if (Array.isArray(hooksJson.hooks)) {
      for (const hook of hooksJson.hooks) {
        if (hook.events && Array.isArray(hook.events)) {
          for (const event of hook.events) {
            if (typeof event === 'string') {
              allEvents.add(event);
            }
          }
        }
      }
    } else {
      for (const event of Object.keys(hooksJson.hooks)) {
        allEvents.add(event);
      }
    }

    if (allEvents.size === 0) {
      return null;
    }

    return {
      configPath,
      events: Array.from(allEvents),
      format: 'codex',
    };
  }
}

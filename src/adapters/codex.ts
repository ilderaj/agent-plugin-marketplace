import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';
import type {
  SourceAdapter,
  DiscoveredPlugin,
  PluginIR,
  SourceInfo,
  ManifestInfo,
  Components,
  Compatibility,
  CompatLevel,
  SkillRef,
  HookRef,
  AgentRef,
  AppRef,
  McpRef,
  CommandRef,
  RuleRef,
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
          } catch {
            // Skip if no valid marker directory or plugin.json
          }
        }
      }
    } catch (err) {
      // Return empty array if directory doesn't exist
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
      version: pluginJson.version,
      description: pluginJson.description,
      author: pluginJson.author,
      license: pluginJson.license,
      homepage: pluginJson.homepage,
      repository: pluginJson.repository,
      keywords: pluginJson.keywords,
      category: pluginJson.category,
      logo: pluginJson.logo,
      raw: pluginJson,
    };
  }

  private async parseSkills(pluginDir: string, pluginJson: any): Promise<SkillRef[]> {
    const skills: SkillRef[] = [];
    
    if (pluginJson.skills && Array.isArray(pluginJson.skills)) {
      for (const skillPath of pluginJson.skills) {
        const fullPath = join(pluginDir, skillPath);
        const scriptsPath = join(fullPath, 'scripts');
        
        let hasScripts = false;
        try {
          const scriptsStat = await stat(scriptsPath);
          hasScripts = scriptsStat.isDirectory();
        } catch {
          // No scripts directory
        }
        
        const name = skillPath.split('/').pop() || skillPath;
        
        skills.push({
          name,
          path: skillPath,
          hasScripts,
        });
      }
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
        
        if (hooksJson.hooks && Array.isArray(hooksJson.hooks)) {
          // Aggregate all events from all hooks in this config file
          const allEvents = new Set<string>();
          
          for (const hook of hooksJson.hooks) {
            if (hook.events && Array.isArray(hook.events)) {
              for (const event of hook.events) {
                allEvents.add(event);
              }
            }
          }
          
          // Generate a single HookRef for this config file
          hooks.push({
            configPath: pluginJson.hooks,
            events: Array.from(allEvents),
            format: 'codex',
          });
        }
      } catch {
        // No hooks file or invalid format
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
          if (entry.isFile() && entry.name.endsWith('.yaml')) {
            agents.push({
              name: entry.name.replace('.yaml', ''),
              path: `agents/${entry.name}`,
              format: 'codex-yaml',
            });
          }
        }
      }
    } catch {
      // No agents directory
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
    } catch {
      // No .app.json file
    }
    
    return apps;
  }

  private async parseMcpServers(pluginDir: string): Promise<McpRef[]> {
    const mcpServers: McpRef[] = [];
    const mcpJsonPath = join(pluginDir, '.mcp.json');
    
    try {
      const mcpJsonContent = await readFile(mcpJsonPath, 'utf-8');
      const mcpJson = JSON.parse(mcpJsonContent);
      
      const servers = [];
      if (mcpJson.servers && typeof mcpJson.servers === 'object') {
        for (const [name, config] of Object.entries(mcpJson.servers)) {
          const serverConfig = config as any;
          servers.push({
            name,
            transport: serverConfig.transport || 'stdio',
          });
        }
      }
      
      if (servers.length > 0) {
        mcpServers.push({
          configPath: '.mcp.json',
          servers,
        });
      }
    } catch {
      // No .mcp.json file
    }
    
    return mcpServers;
  }

  private computeCompatibility(components: Components): Compatibility {
    const details = [];
    const warnings = [];
    const droppedComponents = [];
    
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
        notes: 'Hooks require format conversion for other platforms',
      });
    }
    
    // Agents need format conversion
    for (const agent of components.agents) {
      details.push({
        type: 'agent',
        name: agent.name,
        level: 'partial' as const,
        notes: 'Agent definitions require format conversion',
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
    
    const overall: CompatLevel = droppedComponents.length > 0 ? 'partial' : 'full';
    
    return {
      overall,
      details,
      warnings,
      droppedComponents,
    };
  }
}

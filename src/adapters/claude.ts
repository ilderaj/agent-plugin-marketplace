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
  ComponentCompat,
  DroppedComponent,
  SkillRef,
  HookRef,
  AgentRef,
  CommandRef,
  McpRef,
} from './types';

export class ClaudeAdapter implements SourceAdapter {
  readonly platform = 'claude-code' as const;
  readonly markerDir = '.claude-plugin';

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
    const skills = await this.parseSkills(pluginDir);
    const hooks = await this.parseHooks(pluginDir);
    const agents = await this.parseAgents(pluginDir);
    const commands = await this.parseCommands(pluginDir);
    const mcpServers = await this.parseMcpServers(pluginDir);
    
    const components: Components = {
      skills,
      hooks,
      agents,
      commands,
      mcpServers,
      rules: [],
      apps: [],
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

  private async parseSkills(pluginDir: string): Promise<SkillRef[]> {
    const skills: SkillRef[] = [];
    const skillsPath = join(pluginDir, 'skills');
    
    try {
      const skillsStat = await stat(skillsPath);
      if (skillsStat.isDirectory()) {
        const entries = await readdir(skillsPath, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const skillPath = join(skillsPath, entry.name);
            const scriptsPath = join(skillPath, 'scripts');
            
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
            
            skills.push({
              name: entry.name,
              path: `skills/${entry.name}`,
              hasScripts,
            });
          }
        }
      }
    } catch (err: any) {
      // Only ignore if skills directory doesn't exist (optional component)
      if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
        throw err;
      }
    }
    
    return skills;
  }

  private async parseHooks(pluginDir: string): Promise<HookRef[]> {
    const hooks: HookRef[] = [];
    const hooksConfigPath = join(pluginDir, 'hooks/hooks.json');
    
    try {
      const hooksContent = await readFile(hooksConfigPath, 'utf-8');
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
          configPath: 'hooks/hooks.json',
          events: Array.from(allEvents),
          format: 'claude',
        });
      }
    } catch (err: any) {
      // Only ignore if hooks file doesn't exist (optional component)
      if (err.code !== 'ENOENT') {
        throw err;
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
          if (entry.isFile() && entry.name.endsWith('.md')) {
            const name = entry.name.replace(/\.md$/, '');
            agents.push({
              name,
              path: `agents/${entry.name}`,
              format: 'claude-md',
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

  private async parseCommands(pluginDir: string): Promise<CommandRef[]> {
    const commands: CommandRef[] = [];
    const commandsPath = join(pluginDir, 'commands');
    
    try {
      const commandsStat = await stat(commandsPath);
      if (commandsStat.isDirectory()) {
        const entries = await readdir(commandsPath, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.isFile() && (entry.name.endsWith('.sh') || entry.name.endsWith('.js') || entry.name.endsWith('.ts'))) {
            const name = entry.name.replace(/\.(sh|js|ts)$/, '');
            commands.push({
              name,
              path: `commands/${entry.name}`,
            });
          }
        }
      }
    } catch (err: any) {
      // Only ignore if commands directory doesn't exist (optional component)
      if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
        throw err;
      }
    }
    
    return commands;
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
    
    // Hooks need format conversion for other platforms
    for (const hook of components.hooks) {
      details.push({
        type: 'hook',
        name: hook.configPath,
        level: 'partial' as const,
        notes: 'Claude hooks may require format adaptation for VS Code extension API',
      });
    }
    
    // Agents need format conversion
    for (const agent of components.agents) {
      details.push({
        type: 'agent',
        name: agent.name,
        level: 'partial' as const,
        notes: 'Claude markdown agents may require format conversion for other platforms',
      });
    }
    
    // Commands may need platform-specific handling
    for (const command of components.commands) {
      details.push({
        type: 'command',
        name: command.name,
        level: 'partial' as const,
        notes: 'Commands may require adaptation for platform-specific execution contexts',
      });
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
}

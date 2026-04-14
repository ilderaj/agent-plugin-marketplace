/**
 * Agent plugin marketplace type definitions
 * Defines the intermediate representation (IR) for cross-platform plugin compatibility
 */

/** Supported agent platforms */
export type Platform = 'codex' | 'claude-code' | 'cursor';

/** Compatibility level for cross-platform components */
export type CompatLevel = 'full' | 'partial' | 'degraded' | 'unsupported';

/** Platform-specific adapter for discovering and parsing plugins */
export interface SourceAdapter {
  readonly platform: Platform;
  readonly markerDir: string;
  discover(repoPath: string): Promise<DiscoveredPlugin[]>;
  parse(pluginDir: string): Promise<PluginIR>;
}

/** Plugin discovered in a repository */
export interface DiscoveredPlugin {
  name: string;
  path: string;
  markerPath: string;
}

/** Intermediate representation of a plugin */
export interface PluginIR {
  id: string;
  source: SourceInfo;
  manifest: ManifestInfo;
  components: Components;
  compatibility: Compatibility;
}

/** Source metadata for a plugin */
export interface SourceInfo {
  platform: Platform;
  repoUrl: string;
  pluginPath: string;
  commitSha: string;
  version: string;
}

/** Plugin manifest author information */
export interface ManifestAuthor {
  name: string;
  email?: string;
  url?: string;
}

/** Plugin manifest metadata */
export interface ManifestInfo {
  name: string;
  displayName?: string;
  version: string;
  description: string;
  author: ManifestAuthor;
  license?: string;
  homepage?: string;
  repository?: string;
  keywords?: string[];
  category?: string;
  logo?: string;
  raw: unknown;
}

/** All plugin components */
export interface Components {
  skills: SkillRef[];
  hooks: HookRef[];
  agents: AgentRef[];
  commands: CommandRef[];
  mcpServers: McpRef[];
  rules: RuleRef[];
  apps: AppRef[];
}

/** Skill component reference */
export interface SkillRef {
  name: string;
  path: string;
  hasScripts: boolean;
}

/** Hook component reference */
export interface HookRef {
  configPath: string;
  events: string[];
  format: 'claude' | 'codex' | 'cursor';
}

/** Agent component reference */
export interface AgentRef {
  name: string;
  path: string;
  format: 'claude-md' | 'cursor-md' | 'codex-yaml';
}

/** Command component reference */
export interface CommandRef {
  name: string;
  path: string;
}

/** MCP server reference */
export interface McpServerRef {
  name: string;
  transport: string;
}

/** MCP component reference */
export interface McpRef {
  configPath: string;
  servers: McpServerRef[];
}

/** Rule component reference */
export interface RuleRef {
  path: string;
  alwaysApply: boolean;
  globs?: string[];
}

/** App component reference */
export interface AppRef {
  configPath: string;
  description: string;
}

/** Component dropped during conversion */
export interface DroppedComponent {
  type: string;
  reason: string;
}

/** Compatibility detail for a component */
export interface ComponentCompat {
  type: string;
  name: string;
  level: CompatLevel;
  notes: string;
}

/** Overall compatibility information */
export interface Compatibility {
  overall: CompatLevel;
  details: ComponentCompat[];
  warnings: string[];
  droppedComponents: DroppedComponent[];
}

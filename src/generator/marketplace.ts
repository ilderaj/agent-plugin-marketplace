import type { Compatibility, DroppedComponent, ManifestAuthor, Platform, PluginIR } from '../adapters/types';
import { normalizeGeneratedPluginName, platformLabel } from './vscode-plugin';

export interface MarketplaceConfig {
  name: string;
  owner: Pick<ManifestAuthor, 'name'> & Partial<Pick<ManifestAuthor, 'email' | 'url'>>;
  metadata: {
    description: string;
  };
}

export interface MarketplacePluginEntry {
  name: string;
  source: string;
  description: string;
  version?: string;
  author?: ManifestAuthor;
  repository?: string;
  keywords?: string[];
  category?: string;
  tags?: string[];
  strict: boolean;
}

export interface MarketplaceDocument {
  name: string;
  owner: MarketplaceConfig['owner'];
  metadata: MarketplaceConfig['metadata'];
  plugins: MarketplacePluginEntry[];
}

/** MCP connection policy: whether a server should be disabled, connected on demand, or preconnected. */
export type McpConnectionPolicy = 'disabled' | 'on_demand' | 'preconnect';

/** Runtime MCP server descriptor carrying key, command, args, and optional env. */
export interface RuntimeMcpServerDescriptor {
  key: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/** Runtime MCP metadata with servers and default connection policy. */
export interface RuntimeMcpMetadata {
  defaultConnectionPolicy: Exclude<McpConnectionPolicy, 'disabled'>;
  servers: RuntimeMcpServerDescriptor[];
}

/** Official plugin manifest — written to `plugin.json` (Copilot CLI compatible). */
export interface OfficialPluginManifest {
  name: string;
  version: string;
  description: string;
  author?: ManifestAuthor;
  license?: string;
  homepage?: string;
  repository?: string;
  keywords?: string[];
  category?: string;
  tags?: string[];
  skills?: './skills/';
  agents?: './agents/';
  commands?: './commands/';
  hooks?: './hooks/hooks.json';
  mcpServers?: './.mcp.json';
  strict: false;
}

/** Meta sidecar — written to `_meta.json` (internal use, not part of the official manifest). */
export interface MetaPluginManifest {
  displayName: string;
  _source: {
    platform: Platform;
    upstream: string;
    pluginPath: string;
    commitSha: string;
    version: string;
  };
  _compatibility: {
    overall: Compatibility['overall'];
    notes: string[];
    warnings: string[];
    droppedComponents: DroppedComponent[];
  };
  _runtime?: {
    mcp?: RuntimeMcpMetadata;
  };
}

/** Returns a sanitized author suitable for inclusion in marketplace.json, or undefined if invalid. */
function sanitizeAuthor(author: ManifestAuthor | undefined): ManifestAuthor | undefined {
  if (!author?.name) return undefined;
  const sanitized: ManifestAuthor = { name: author.name };
  // Only include email if it is a single valid email address
  if (author.email && /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(author.email)) {
    sanitized.email = author.email;
  }
  if (author.url) sanitized.url = author.url;
  return sanitized;
}

export function createMarketplaceEntry(ir: PluginIR): MarketplacePluginEntry {
  const name = normalizeGeneratedPluginName(ir);
  const entry: MarketplacePluginEntry = {
    name,
    source: `./plugins/${name}`,
    description: `${ir.manifest.description} (from ${platformLabel(ir.source.platform)})`,
    strict: false,
  };

  if (ir.manifest.version) entry.version = ir.manifest.version;
  const author = sanitizeAuthor(ir.manifest.author);
  if (author) entry.author = author;
  if (ir.manifest.repository) entry.repository = ir.manifest.repository;
  if (ir.manifest.keywords) entry.keywords = ir.manifest.keywords;
  if (ir.manifest.tags) entry.tags = ir.manifest.tags;
  if (ir.manifest.category) entry.category = ir.manifest.category;

  return entry;
}

export function createMarketplaceEntryFromManifests(
  official: OfficialPluginManifest,
  meta: MetaPluginManifest,
): MarketplacePluginEntry {
  const entry: MarketplacePluginEntry = {
    name: official.name,
    source: `./plugins/${official.name}`,
    description: `${official.description} (from ${platformLabel(meta._source.platform)})`,
    strict: false,
  };

  if (official.version) entry.version = official.version;
  const author = sanitizeAuthor(official.author);
  if (author) entry.author = author;
  if (official.repository) entry.repository = official.repository;
  if (official.keywords) entry.keywords = official.keywords;
  if (official.category) entry.category = official.category;
  if (official.tags) entry.tags = official.tags;

  return entry;
}

export class MarketplaceGenerator {
  constructor(private readonly config: MarketplaceConfig) {}

  generate(irs: PluginIR[]): MarketplaceDocument {
    return this.generateFromEntries(irs.map((ir) => createMarketplaceEntry(ir)));
  }

  generateFromEntries(entries: MarketplacePluginEntry[]): MarketplaceDocument {
    return {
      name: this.config.name,
      owner: this.config.owner,
      metadata: this.config.metadata,
      plugins: [...entries]
        .sort((left, right) => left.name.localeCompare(right.name)),
    };
  }
}

import type { ManifestAuthor, Platform, PluginIR } from '../adapters/types';
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
}

export interface MarketplaceDocument {
  name: string;
  owner: MarketplaceConfig['owner'];
  metadata: MarketplaceConfig['metadata'];
  plugins: MarketplacePluginEntry[];
}

export interface GeneratedPluginMarketplaceManifest {
  name: string;
  description: string;
  _source: {
    platform: Platform;
  };
}

export function createMarketplaceEntry(ir: PluginIR): MarketplacePluginEntry {
  const name = normalizeGeneratedPluginName(ir);
  return {
    name,
    source: `plugins/${name}`,
    description: `${ir.manifest.description} (from ${platformLabel(ir.source.platform)})`,
  };
}

export function createMarketplaceEntryFromGeneratedManifest(
  manifest: GeneratedPluginMarketplaceManifest,
): MarketplacePluginEntry {
  return {
    name: manifest.name,
    source: `plugins/${manifest.name}`,
    description: `${manifest.description} (from ${platformLabel(manifest._source.platform)})`,
  };
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

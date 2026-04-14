import type { ManifestAuthor, PluginIR } from '../adapters/types';
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

export class MarketplaceGenerator {
  constructor(private readonly config: MarketplaceConfig) {}

  generate(irs: PluginIR[]): MarketplaceDocument {
    return {
      name: this.config.name,
      owner: this.config.owner,
      metadata: this.config.metadata,
      plugins: irs
        .map((ir) => {
          const name = normalizeGeneratedPluginName(ir);
          return {
            name,
            source: `plugins/${name}`,
            description: `${ir.manifest.description} (from ${platformLabel(ir.source.platform)})`,
          };
        })
        .sort((left, right) => left.name.localeCompare(right.name)),
    };
  }
}

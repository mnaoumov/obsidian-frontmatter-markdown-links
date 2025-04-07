import type { PluginTypesBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginTypesBase';

import type { Plugin } from './Plugin.ts';

export interface PluginTypes extends PluginTypesBase {
  plugin: Plugin;
}

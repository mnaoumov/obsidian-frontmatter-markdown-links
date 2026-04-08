import { PluginSettingsManagerBase } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-manager-base';

import type { PluginTypes } from './PluginTypes.ts';

import { PluginSettings } from './PluginSettings.ts';

export class PluginSettingsManager extends PluginSettingsManagerBase<PluginTypes> {
  protected override createDefaultSettings(): PluginSettings {
    return new PluginSettings();
  }
}

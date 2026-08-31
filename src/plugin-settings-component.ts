import type { DataHandler } from 'obsidian-dev-utils/obsidian/data-handler';
import type { PluginEventSource } from 'obsidian-dev-utils/obsidian/plugin/plugin-event-source';

import { PluginSettingsComponentBase } from 'obsidian-dev-utils/obsidian/components/plugin-settings-component';

import { PluginSettings } from './plugin-settings.ts';

interface PluginSettingsComponentConstructorParams {
  readonly dataHandler: DataHandler;
  readonly pluginEventSource: PluginEventSource;
}

class LegacySettings {
  // Owned by Advanced Rename and Delete Handler since 3.0.0. The converter is what keeps the user's value:
  // The saved record is rebuilt from the declared properties alone, so the first save after the property was
  // Dropped would otherwise strip it from `data.json` before it could ever be offered.
  public shouldHandleRenames = true;
}

export class PluginSettingsComponent extends PluginSettingsComponentBase<PluginSettings> {
  public constructor(params: PluginSettingsComponentConstructorParams) {
    super({
      ...params,
      pluginSettingsClass: PluginSettings
    });
  }

  protected override registerLegacySettingsConverters(): void {
    this.registerLegacySettingsConverter(LegacySettings, (legacySettings) => {
      if (legacySettings.shouldHandleRenames !== undefined) {
        legacySettings.proposedShouldHandleRenames = legacySettings.shouldHandleRenames;
      }
    });
  }
}

import { Setting } from 'obsidian';
import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginSettingsTabBase';

import type { PluginTypes } from './PluginTypes.ts';

export class PluginSettingsTab extends PluginSettingsTabBase<PluginTypes> {
  public override display(): void {
    super.display();

    new Setting(this.containerEl)
      .setName('Show initialization notice')
      .setDesc('Whether to show a notice when the plugin is being initialized')
      .addToggle((toggle) => {
        this.bind(toggle, 'shouldShowInitializationNotice');
      });
  }
}

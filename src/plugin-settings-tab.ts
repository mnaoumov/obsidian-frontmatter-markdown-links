import { Setting } from 'obsidian';
import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-tab';

import type { PluginSettings } from './plugin-settings.ts';

export class PluginSettingsTab extends PluginSettingsTabBase<PluginSettings> {
  public override displayLegacy(): void {
    super.displayLegacy();

    new Setting(this.containerEl)
      .setName('Should show initialization notice')
      .setDesc('Whether to show a notice when the plugin is being initialized')
      .addToggle((toggle) => {
        this.bind({
          propertyName: 'shouldShowInitializationNotice',
          valueComponent: toggle
        });
      });

    new Setting(this.containerEl)
      .setName('Should handle renames')
      .setDesc(createFragment((f) => {
        f.appendText('Whether to handle renames.');
        f.createEl('br');
        f.appendText('If enabled, it overrides the default Obsidian link update mechanism.');
        f.createEl('br');
        f.appendText('If disabled, it will use the default Obsidian link update mechanism.');
        f.createEl('br');
        f.appendText('⚠️ Default Obsidian link update mechanism can ruin some of your frontmatter links.');
      }))
      .addToggle((toggle) => {
        this.bind({
          propertyName: 'shouldHandleRenames',
          valueComponent: toggle
        });
      });
  }
}

import type { SettingDefinitionItem } from 'obsidian';

import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-tab';

import type { PluginSettings } from './plugin-settings.ts';

export class PluginSettingsTab extends PluginSettingsTabBase<PluginSettings> {
  protected override getSettingDefinitionItems(): SettingDefinitionItem[] {
    return [
      this.settingEx({
        desc: 'Whether to show a notice when the plugin is being initialized',
        name: 'Should show initialization notice',
        render: (setting) => {
          setting.addToggle((toggle) => {
            this.bind({
              propertyName: 'shouldShowInitializationNotice',
              valueComponent: toggle
            });
          });
        }
      }),
      this.settingEx({
        desc: createFragment((f) => {
          f.appendText('Whether to handle renames.');
          f.createEl('br');
          f.appendText('If enabled, it overrides the default Obsidian link update mechanism.');
          f.createEl('br');
          f.appendText('If disabled, it will use the default Obsidian link update mechanism.');
          f.createEl('br');
          f.appendText('⚠️ Default Obsidian link update mechanism can ruin some of your frontmatter links.');
        }),
        name: 'Should handle renames',
        render: (setting) => {
          setting.addToggle((toggle) => {
            this.bind({
              propertyName: 'shouldHandleRenames',
              valueComponent: toggle
            });
          });
        }
      })
    ];
  }
}

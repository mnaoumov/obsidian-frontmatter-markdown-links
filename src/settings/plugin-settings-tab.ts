import type { PluginSuggestionComponent } from '@mnaoumov/obsidian-lib/components/plugin-suggestion-component';
import type { PluginSettingsTabBaseConstructorParams } from '@mnaoumov/obsidian-lib/plugin/plugin-settings-tab';
import type { SettingDefinitionItem } from 'obsidian';

import { SuggestedPluginState } from '@mnaoumov/obsidian-lib/components/plugin-suggestion-component';
import { PluginSettingsTabBase } from '@mnaoumov/obsidian-lib/plugin/plugin-settings-tab';

import type { PluginSettings } from './plugin-settings.ts';

interface PluginSettingsTabConstructorParams extends PluginSettingsTabBaseConstructorParams<PluginSettings> {
  readonly pluginSuggestionComponent: PluginSuggestionComponent;
}

export class PluginSettingsTab extends PluginSettingsTabBase<PluginSettings> {
  private readonly pluginSuggestionComponent: PluginSuggestionComponent;

  public constructor(params: PluginSettingsTabConstructorParams) {
    super(params);
    this.pluginSuggestionComponent = params.pluginSuggestionComponent;
  }

  protected override getSettingDefinitionItems(): SettingDefinitionItem[] {
    return [
      // The suggestion banner has to travel as a row: Obsidian renders the declarative definitions and never
      // calls `display()` once `getSettingDefinitions()` is non-empty, so there is no container to write into
      // otherwise. The row body is emptied first, leaving the Setting element as a bare host for the banner.
      this.settingEx({
        name: '',
        render: (setting) => {
          setting.settingEl.empty();
          this.pluginSuggestionComponent.renderBanner(setting.settingEl);
        },
        searchable: false,
        visible: () => this.pluginSuggestionComponent.getSuggestedPluginState() !== SuggestedPluginState.Enabled
      }),
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
        desc: 'Share validated cache seeds with other devices. Optional; takes effect after reloading the plugin.',
        name: 'Share frontmatter cache',
        render: (setting) => {
          setting.addToggle((toggle) => {
            this.bind({ propertyName: 'shouldShareCache', valueComponent: toggle });
          });
        }
      }),
      this.settingEx({
        desc: 'Non-dot vault folder for Markdown seeds. Markdown syncs with default Sync file types. Excluded files hides it from search, graph and switcher, but metadata parsing still runs. Reload after changing.',
        name: 'Cache sharing folder',
        render: (setting) => {
          setting.addText((text) => {
            this.bind({ propertyName: 'cacheSharingFolder', valueComponent: text });
          });
        }
      })
    ];
  }
}

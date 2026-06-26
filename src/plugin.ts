import type { RenameDeleteHandlerSettings } from 'obsidian-dev-utils/obsidian/components/rename-delete-handler-component';

import { PluginSettingsTabComponent } from 'obsidian-dev-utils/obsidian/components/plugin-settings-tab-component';
import { RenameDeleteHandlerComponent } from 'obsidian-dev-utils/obsidian/components/rename-delete-handler-component';
import { PluginDataHandler } from 'obsidian-dev-utils/obsidian/data-handler';
import { PluginEditorExtensionRegistrar } from 'obsidian-dev-utils/obsidian/editor-extension-registrar';
import { PluginBase } from 'obsidian-dev-utils/obsidian/plugin/plugin';
import { PluginEventSourceImpl } from 'obsidian-dev-utils/obsidian/plugin/plugin-event-source';

import { FrontmatterMarkdownLinksComponent } from './frontmatter-markdown-links-component.ts';
import { LinkFixer } from './link-fixer.ts';
import { PatchedInputElementMap } from './patched-input-element-map.ts';
import { PluginSettingsComponent } from './plugin-settings-component.ts';
import { PluginSettingsTab } from './plugin-settings-tab.ts';

export class Plugin extends PluginBase {
  protected override onloadImpl(): void {
    const pluginSettingsComponent = this.addChild(
      new PluginSettingsComponent({
        dataHandler: new PluginDataHandler(this),
        pluginEventSource: new PluginEventSourceImpl(this)
      })
    );
    this.addChild(
      new PluginSettingsTabComponent({
        plugin: this,
        pluginSettingsTab: new PluginSettingsTab({
          plugin: this,
          pluginSettingsComponent
        })
      })
    );

    const linkFixer = new LinkFixer();
    const patchedInputElementMap = new PatchedInputElementMap();
    const editorExtensionRegistrar = new PluginEditorExtensionRegistrar(this);

    this.addChild(
      new FrontmatterMarkdownLinksComponent({
        abortSignalComponent: this.abortSignalComponent,
        app: this.app,
        editorExtensionRegistrar,
        linkFixer,
        patchedInputElementMap,
        pluginNoticeComponent: this.pluginNoticeComponent,
        pluginSettingsComponent
      })
    );

    this.addChild(
      new RenameDeleteHandlerComponent({
        abortSignalComponent: this.abortSignalComponent,
        app: this.app,
        pluginId: this.manifest.id,
        pluginNoticeComponent: this.pluginNoticeComponent,
        settingsBuilder: (): Partial<RenameDeleteHandlerSettings> => ({
          shouldHandleRenames: pluginSettingsComponent.settings.shouldHandleRenames
        })
      })
    );
  }
}

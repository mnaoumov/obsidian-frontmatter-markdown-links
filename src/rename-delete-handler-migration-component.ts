import type { App } from 'obsidian';
import type { PluginApiRef } from 'obsidian-dev-utils/obsidian/plugin/plugin-api';

import { invokeAsyncSafely } from 'obsidian-dev-utils/async';
import { registerAsyncEvent } from 'obsidian-dev-utils/obsidian/components/async-events-component';
import { ComponentEx } from 'obsidian-dev-utils/obsidian/components/component-ex';
import { watchPluginApi } from 'obsidian-dev-utils/obsidian/plugin/plugin-api';

import type { PluginSettingsComponent } from './plugin-settings-component.ts';

import { ADVANCED_RENAME_AND_DELETE_HANDLER_PLUGIN_ID } from './advanced-rename-and-delete-handler.ts';

// Advanced Rename and Delete Handler's public API, as this plugin compiles against it. Declared here rather
// Than imported: that plugin is an Obsidian plugin repo, not an npm package, so there is nothing to depend
// On. It publishes contract version `1.0.0`, so consumers ask for `^1`.
interface AdvancedRenameAndDeleteHandlerApi {
  migrateSettings(params: MigrateSettingsParams): Promise<MigrateSettingsResult>;
}

interface MigratableSettings {
  readonly shouldHandleRenames?: boolean;
}

interface MigrateSettingsParams {
  readonly proposedSettings: MigratableSettings;
  readonly sourcePluginId: string;
}

interface MigrateSettingsResult {
  readonly isApplied: boolean;
}

interface RenameDeleteHandlerMigrationComponentConstructorParams {
  readonly app: App;
  readonly pluginSettingsComponent: PluginSettingsComponent;
  readonly sourcePluginId: string;
}

export class RenameDeleteHandlerMigrationComponent extends ComponentEx {
  private apiRef: null | PluginApiRef<AdvancedRenameAndDeleteHandlerApi> = null;

  private readonly app: App;

  private isProposing = false;
  private readonly pluginSettingsComponent: PluginSettingsComponent;
  private readonly sourcePluginId: string;

  public constructor(params: RenameDeleteHandlerMigrationComponentConstructorParams) {
    super();
    this.app = params.app;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
    this.sourcePluginId = params.sourcePluginId;
  }

  public override onload(): void {
    // Nothing is gated on the pending value HERE. The settings component is a sibling whose own load is still
    // In flight at this point, so its `settings` still holds the defaults — reading the pending value now
    // Would see `null` on a vault that has one, register no watch, and lose the migration for good. Both
    // Edges are wired up instead, and `propose` re-reads the value each time it runs.
    const ref = watchPluginApi<AdvancedRenameAndDeleteHandlerApi>({
      apiVersionRange: '^1',
      app: this.app,
      component: this,
      pluginId: ADVANCED_RENAME_AND_DELETE_HANDLER_PLUGIN_ID
    });

    // Driven by the ref's own event rather than by `whenAvailable()`, deliberately. That wait blocks for ten
    // Seconds and then throws when the plugin is simply not installed, which would stall this plugin's load
    // For every user who declines the suggestion. Watching instead costs nothing while the plugin is absent
    // And offers the migration the moment it appears — including immediately after the user installs it from
    // The suggestion banner.
    this.apiRef = ref;
    ref.on('change', this.handleApiChange);
    this.register(() => {
      ref.off('change', this.handleApiChange);
    });

    // The two edges that can make an offer possible, in either order: the provider appearing, and this
    // Plugin's own settings arriving from disk.
    registerAsyncEvent(this, this.pluginSettingsComponent.on('loadSettings', this.handleApiChange));
    this.handleApiChange();
  }

  // A stable identity, so the same function can be handed to both `on` and `off`.
  private readonly handleApiChange = (): void => {
    invokeAsyncSafely(() => this.propose(this.apiRef?.value ?? null));
  };

  private async propose(api: AdvancedRenameAndDeleteHandlerApi | null): Promise<void> {
    const proposedShouldHandleRenames = this.pluginSettingsComponent.settings.proposedShouldHandleRenames;
    if (!api || this.isProposing || proposedShouldHandleRenames === null) {
      return;
    }

    this.isProposing = true;
    try {
      const result = await api.migrateSettings({
        proposedSettings: { shouldHandleRenames: proposedShouldHandleRenames },
        sourcePluginId: this.sourcePluginId
      });

      // A cancel is not an answer, so the value stays pending and the offer comes back — on the next load, or
      // As soon as the provider reloads. Only an applied migration retires it.
      //
      // `editAndSave`, not `setProperty`: the latter only edits the in-memory state, so the retirement would
      // Be forgotten on the next reload and the migration would be offered again forever.
      if (result.isApplied) {
        await this.pluginSettingsComponent.editAndSave((settings) => {
          settings.proposedShouldHandleRenames = null;
        });
      }
    } finally {
      this.isProposing = false;
    }
  }
}

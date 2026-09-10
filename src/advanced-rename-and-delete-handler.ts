// The plugin that owns rename/delete handling since this plugin's 3.0.0. Shared by the suggestion the plugin
// Shows and the settings migration it offers, so the id and the display name are written once.
export const ADVANCED_RENAME_AND_DELETE_HANDLER_PLUGIN_ID = 'advanced-rename-and-delete-handler';

export const ADVANCED_RENAME_AND_DELETE_HANDLER_PLUGIN_NAME = 'Advanced Rename and Delete Handler';

/**
 * The settings this plugin may hand over to that plugin.
 *
 * The payload half of the handover contract, which stays this plugin's own — the envelope around it
 * (`migrateSettings`, who proposed, whether it was applied) comes from
 * `obsidian-dev-utils/obsidian/plugin/settings-migration-api`. Optional, because a proposal carries only
 * what this plugin actually held, so a value the owning plugin already has is never overwritten by a default
 * nobody chose.
 */
export interface MigratableSettings {
  /**
   * Whether renames and moves are handled at all.
   */
  readonly shouldHandleRenames?: boolean;
}

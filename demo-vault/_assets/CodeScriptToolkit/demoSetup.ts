import type { App } from 'obsidian';

import { Notice } from 'obsidian';
import {
  configureCommunityPlugin,
  disableCommunityPlugin,
  enableCommunityPlugin
} from 'obsidian-dev-utils/obsidian/community-plugins';

const PLUGIN_ID = 'frontmatter-markdown-links';
const SECOND_TARGET_PATH = 'Targets/Second target.md';
const RENAMED_SECOND_TARGET_PATH = 'Targets/Second target renamed.md';

interface DemoSettingsPatch {
  shouldHandleRenames?: boolean;
  shouldShowInitializationNotice?: boolean;
}

/**
 * Opens the note the frontmatter markdown link points at and reveals its Backlinks pane.
 *
 * Manual equivalent: open `Targets/Second target.md`, then run **Backlinks: Show backlinks**.
 */
export async function showSecondTargetBacklinks(app: App): Promise<void> {
  const note = app.vault.getFileByPath(SECOND_TARGET_PATH) ?? app.vault.getFileByPath(RENAMED_SECOND_TARGET_PATH);
  if (!note) {
    new Notice('The second target note is missing from Targets/.');
    return;
  }

  await app.workspace.getLeaf(false).openFile(note);
  app.commands.executeCommandById('backlink:open-backlinks');
}

/**
 * Turns the plugin off. With the Backlinks pane open on the second target, the backlink coming from a
 * frontmatter MARKDOWN link disappears, while the wikilink-sourced one stays — which is the whole
 * difference this plugin makes, shown rather than asserted.
 *
 * Manual equivalent: toggle **Frontmatter Markdown Links** off in **Settings -> Community plugins**.
 */
export async function disablePlugin(app: App): Promise<void> {
  await disableCommunityPlugin({ app, pluginId: PLUGIN_ID });
  new Notice('Plugin off. Look at the Backlinks pane — the markdown-link backlink is gone.');
}

/**
 * Turns the plugin back on.
 *
 * Manual equivalent: toggle **Frontmatter Markdown Links** back on in **Settings -> Community plugins**.
 */
export async function enablePlugin(app: App): Promise<void> {
  await enableCommunityPlugin({ app, pluginId: PLUGIN_ID });
  new Notice('Plugin on. The backlink is back.');
}

/**
 * Renames the second target note, so you can watch the frontmatter markdown link pointing at it get
 * rewritten — the thing `shouldHandleRenames` governs.
 *
 * Manual equivalent: rename `Targets/Second target.md` in the File Explorer.
 */
export async function renameSecondTarget(app: App): Promise<void> {
  const note = app.vault.getFileByPath(SECOND_TARGET_PATH);
  if (!note) {
    new Notice('Already renamed — press the restore button to put it back.');
    return;
  }

  await app.fileManager.renameFile(note, RENAMED_SECOND_TARGET_PATH);
  new Notice('Renamed. Look at the `reference` property of 02 Backlinks.');
}

/**
 * Renames it back.
 *
 * Manual equivalent: rename `Targets/Second target renamed.md` back to `Second target.md`.
 */
export async function restoreSecondTargetName(app: App): Promise<void> {
  const note = app.vault.getFileByPath(RENAMED_SECOND_TARGET_PATH);
  if (!note) {
    new Notice('Nothing to restore — the note already has its original name.');
    return;
  }

  await app.fileManager.renameFile(note, SECOND_TARGET_PATH);
  new Notice('Name restored, and the frontmatter link followed it back.');
}

/**
 * Applies a settings patch, live, through the plugin's own settings component.
 *
 * Manual equivalent: change the same option in **Settings -> Community plugins -> Frontmatter Markdown
 * Links**.
 */
export async function changeSettings(app: App, patch: DemoSettingsPatch): Promise<void> {
  await configureCommunityPlugin({ app, pluginId: PLUGIN_ID, settings: patch });
  new Notice('Applied.');
}

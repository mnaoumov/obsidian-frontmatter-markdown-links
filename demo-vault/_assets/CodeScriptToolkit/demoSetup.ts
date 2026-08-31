import type { App } from 'obsidian';

import { Notice } from 'obsidian';
import {
  disableCommunityPlugin,
  enableCommunityPlugin
} from 'obsidian-dev-utils/obsidian/community-plugins';

const PLUGIN_ID = 'frontmatter-markdown-links';
const SECOND_TARGET_PATH = 'Targets/Second target.md';

/**
 * Opens the note the frontmatter markdown link points at and reveals its Backlinks pane.
 *
 * Manual equivalent: open `Targets/Second target.md`, then run **Backlinks: Show backlinks**.
 */
export async function showSecondTargetBacklinks(app: App): Promise<void> {
  const note = app.vault.getFileByPath(SECOND_TARGET_PATH);
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

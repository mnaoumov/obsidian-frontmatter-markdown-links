import type {
  App,
  WorkspaceLeaf
} from 'obsidian';

import {
  MarkdownView,
  Notice,
  Platform
} from 'obsidian';


const PLUGIN_ID ='frontmatter-markdown-links';
const THIRD_TARGET_PATH = 'Targets/Third target.md';
const FRONTMATTER_LINKS_NOTE_PATH = '01 Frontmatter markdown links.md';
const LINK_DATA_SELECTOR = '[data-frontmatter-markdown-links-link-data]';
const SOURCE_MODE_RENDER_TIMEOUT_IN_MILLISECONDS = 5000;
const SOURCE_MODE_RENDER_POLL_IN_MILLISECONDS = 100;

/**
 * Opens the note that only the multi-link `seeAlso` property of `02 Backlinks` points at, and reveals its
 * Backlinks pane.
 *
 * Manual equivalent: open `Targets/Third target.md`, then run **Backlinks: Show backlinks**.
 */
export async function showThirdTargetBacklinks(app: App): Promise<void> {
  const note = app.vault.getFileByPath(THIRD_TARGET_PATH);
  if (!note) {
    new Notice('The third target note is missing from Targets/.');
    return;
  }

  await app.workspace.getLeaf(false).openFile(note);
  app.commands.executeCommandById('backlink:open-backlinks');
}

/**
 * Turns the plugin off. With the Backlinks pane open on the third target, the backlink coming from a
 * property holding several links disappears, because Obsidian does not count a link inside such a value
 * by itself — which is the difference this plugin makes, shown rather than asserted.
 *
 * Manual equivalent: toggle `Frontmatter Markdown Links` off in **Settings -> Community plugins**.
 *
 * @param message - The notice to show once the plugin is off, saying what to look at.
 */
export async function disablePlugin(app: App, message = 'Plugin off. Look at the Backlinks pane — the backlink from the multi-link property is gone.'): Promise<void> {
  await app.plugins.disablePluginAndSave(PLUGIN_ID);
  new Notice(message);
}

/**
 * Turns the plugin back on.
 *
 * Manual equivalent: toggle `Frontmatter Markdown Links` back on in **Settings -> Community plugins**.
 *
 * @param message - The notice to show once the plugin is on again.
 */
export async function enablePlugin(app: App, message = 'Plugin on. The backlink is back.'): Promise<void> {
  await app.plugins.enablePluginAndSave(PLUGIN_ID);
  new Notice(message);
}

/**
 * Opens `01 Frontmatter markdown links` a second time, in Source mode, in a split beside the current
 * pane, so its frontmatter shows as the raw YAML the plugin makes clickable. Reuses that split when it is
 * already open.
 *
 * The buttons stay in the original pane: Source mode shows a ```` ```code-button ```` fence as code, not
 * as a button.
 *
 * Manual equivalent: open the note in a new pane and switch it to Source mode (**Toggle Live Preview/Source
 * mode**, or the editing-mode setting).
 */
export async function openFrontmatterLinksNoteInSourceMode(app: App): Promise<void> {
  const leaf = await getOrOpenSourceModeLeaf(app);
  if (!leaf) {
    return;
  }

  new Notice(`Source mode copy open. ${getModifierName()}-click the markdownLink value in it to follow the link.`);
}

/**
 * {@link getModifierName | Ctrl/Cmd}-clicks the `markdownLink` value in the Source mode copy of
 * `01 Frontmatter markdown links`, opening that copy first when it is not open yet. The plugin opens
 * links in Source mode on a modified click, the way Obsidian does for links in the note body, so the
 * target opens in a new tab.
 *
 * With the plugin off, the raw YAML holds no link, and the button says so instead of clicking.
 *
 * Manual equivalent: {@link getModifierName | Ctrl/Cmd}-click `[Second target]` on the `markdownLink:`
 * line of the note in Source mode.
 */
export async function modifierClickMarkdownLinkInSourceMode(app: App): Promise<void> {
  const leaf = await getOrOpenSourceModeLeaf(app);
  if (!leaf) {
    return;
  }

  const linkEl = await waitForSourceModeLinkEl(leaf, 'markdownLink');
  if (!linkEl) {
    new Notice('The markdownLink line is plain text in Source mode, so there is no link to click. Turn the plugin on first.');
    return;
  }

  app.workspace.setActiveLeaf(leaf, { focus: true });
  linkEl.dispatchEvent(
    new MouseEvent('mousedown', {
      bubbles: true,
      button: 0,
      cancelable: true,
      ctrlKey: !Platform.isMacOS,
      metaKey: Platform.isMacOS
    })
  );
}

/**
 * Closes the Source mode copy of `01 Frontmatter markdown links` that the buttons above opened, leaving
 * every other pane alone.
 *
 * Manual equivalent: close that pane.
 */
export function closeFrontmatterLinksNoteSourceMode(app: App): void {
  const leaves = findSourceModeLeaves(app);
  for (const leaf of leaves) {
    leaf.detach();
  }

  new Notice(leaves.length === 0 ? 'No Source mode copy was open.' : 'Source mode copy closed.');
}

function findSourceModeLeaves(app: App): WorkspaceLeaf[] {
  return app.workspace.getLeavesOfType('markdown').filter((leaf) =>
    leaf.view instanceof MarkdownView
    && leaf.view.file?.path === FRONTMATTER_LINKS_NOTE_PATH
    && leaf.view.getMode() === 'source'
    && leaf.view.getState()['source'] === true
  );
}


function getModifierName(): string {
  return Platform.isMacOS ? 'Cmd' : 'Ctrl';
}

async function getOrOpenSourceModeLeaf(app: App): Promise<null | WorkspaceLeaf> {
  const [existingLeaf] = findSourceModeLeaves(app);
  if (existingLeaf) {
    return existingLeaf;
  }

  const note = app.vault.getFileByPath(FRONTMATTER_LINKS_NOTE_PATH);
  if (!note) {
    new Notice(`${FRONTMATTER_LINKS_NOTE_PATH} is missing from the vault.`);
    return null;
  }

  const leaf = app.workspace.getLeaf('split', 'vertical');
  await leaf.openFile(note, { state: { mode: 'source', source: true } });
  return leaf;
}

/**
 * Waits for the plugin to mark the link on a frontmatter line of the Source mode copy. The editor draws
 * its decorations a moment after the pane opens, so a freshly opened copy has none yet.
 */
async function waitForSourceModeLinkEl(leaf: WorkspaceLeaf, propertyKey: string): Promise<HTMLElement | null> {
  const deadline = Date.now() + SOURCE_MODE_RENDER_TIMEOUT_IN_MILLISECONDS;
  for (;;) {
    for (const lineEl of leaf.view.containerEl.querySelectorAll('.cm-line')) {
      if (lineEl.textContent.startsWith(`${propertyKey}:`)) {
        const linkEl = lineEl.querySelector<HTMLElement>(LINK_DATA_SELECTOR);
        if (linkEl) {
          return linkEl;
        }
      }
    }

    if (Date.now() >= deadline) {
      return null;
    }

    await sleep(SOURCE_MODE_RENDER_POLL_IN_MILLISECONDS);
  }
}

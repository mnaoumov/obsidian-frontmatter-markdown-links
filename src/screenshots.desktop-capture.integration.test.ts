/**
 * @file
 *
 * Produces the desktop screenshots the community-store listing needs
 * (T461-P21), driving staged notes in a real Obsidian and writing
 * `images/screenshots/screenshot-desktop-N.png`.
 *
 * THREE shots: the property rendered as a real link, the backlink that only
 * exists because the link resolved, and the plugin's settings tab. The second
 * earns its slot because
 * whether a link can be clicked is a claim a still image struggles to make, while a backlink
 * appearing on the TARGET note is visible proof.
 *
 * The settings shot goes through `openObsidianSettingsTab`. Calling
 * `app.setting.open()` directly does nothing observable: `containerEl` is built
 * at startup, is never in the document, and `open()` does not attach it — so
 * the modal builds into a detached tree and the captured frame is untouched.
 * The helper attaches it BEFORE opening (the order is load-bearing; attaching
 * afterwards leaves the modal on screen showing what it drew while detached)
 * and resolves to the rows the tab rendered.
 *
 * There is deliberately NO plugin-off frame. Disabling the plugin does not undo
 * what it did: the parsed links live in the metadata cache and the property
 * renderer reads from there, so the link stays on screen with the plugin off,
 * and a forced re-render does not clear it either. A frame captioned "without
 * the plugin" that still showed the link would be a lie, and rebuilding the
 * cache without the plugin is not something a capture run can force.
 *
 * Each shot asserts what it claims: that the property holds a rendered link,
 * that the target note names the source in its backlinks, and that the settings
 * tab actually drew its rows.
 */

import {
  mkdirSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import {
  captureObsidianScreenshot,
  evalInObsidian,
  labelScreenshot,
  openObsidianSettingsTab,
  readPngDimensions
} from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

/**
 * `App`, reduced to the inline-title toggle that `obsidian-typings` does not
 * declare. Setting the config alone changes nothing on screen.
 */
interface InlineTitleApp {
  updateInlineTitleDisplay(this: void): void;
}

/**
 * The preview half of a Markdown view, reduced to the call that re-renders it.
 */
interface PreviewMode {
  rerender(this: void, isFull: boolean): void;
}

/**
 * A Markdown view, reduced to {@link PreviewMode}.
 */
interface PreviewRenderView {
  previewMode: PreviewMode;
}

const WIDTH_IN_PIXELS = 1200;
const HEIGHT_IN_PIXELS = 800;

const SOURCE_NOTE_PATH = 'Screenshots/Chapter one.md';
const TARGET_NOTE_PATH = 'Screenshots/Chapter two.md';

/**
 * The plugin's settings tab id, which is its `manifest.json` `id`. Required by
 * `openObsidianSettingsTab`: opening the modal without one leaves
 * `activeTab === null` and draws zero rows, because the modal restores the
 * profile's last tab and a harness-owned profile has never opened one.
 */
const PLUGIN_ID = 'frontmatter-markdown-links';

const IMAGES_DIRECTORY = join(process.cwd(), 'images', 'screenshots');

beforeAll(async () => {
  const vault = getTemporaryVault();

  vault.populate({
    [SOURCE_NOTE_PATH]: buildSourceNote(),
    [TARGET_NOTE_PATH]: '# Chapter two\n\nThe note the property points at.\n'
  });
  await vault.syncToDevice();

  await evalInObsidian({
    async callback({ app, lib: { waitUntil }, sourceNotePath }) {
      const SETTLE_TIMEOUT_IN_MILLISECONDS = 30_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 1000;

      app.changeTheme('obsidian');

      await waitUntil({
        message: 'the staged notes to appear in the vault',
        predicate: () => Boolean(app.vault.getFileByPath(sourceNotePath)),
        timeoutInMilliseconds: SETTLE_TIMEOUT_IN_MILLISECONDS
      });

      // The properties panel is the subject, so it has to be in the document
      // Rather than tucked into a side pane.
      app.vault.setConfig('propertiesInDocument', 'visible');

      app.workspace.leftSplit.collapse();

      app.vault.setConfig('showInlineTitle', false);
      const inlineTitleApp: unknown = app;
      (inlineTitleApp as InlineTitleApp).updateInlineTitleDisplay();

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);
    },
    input: { sourceNotePath: SOURCE_NOTE_PATH },
    vaultPath: vaultPath()
  });
});

describe('desktop store screenshots', () => {
  it('1 - the property rendered as a real link', async () => {
    const probe = await openNoteAndReadProperty(SOURCE_NOTE_PATH);
    expect(probe).toMatchObject({ hasLink: true });
    await shoot(1, 'Markdown links in properties become real links');
  });

  it('2 - the backlink it produces', async () => {
    const backlinks = await openBacklinksForTarget();
    // A still cannot show a click; a backlink on the TARGET is
    // Visible proof the link actually resolved.
    expect(backlinks).toContain('Chapter one');
    await shoot(2, 'And the target counts them as backlinks');
  });

  it('3 - the settings it exposes', async () => {
    const names = await openObsidianSettingsTab({ tabId: PLUGIN_ID, vaultPath: vaultPath() });
    // The rows the tab drew ARE the proof it rendered, so asserting on one is
    // What separates this from a frame of an empty modal. The frame also carries the
    // Banner suggesting Advanced Rename and Delete Handler, which owns rename handling
    // Since 3.0.0 — that row is deliberately unnamed, so the named toggle is what
    // There is to assert on here.
    expect(names).toContain('Should show initialization notice');
    await dismissNotices();
    await shoot(3, 'Rename handling now lives in a companion plugin');
  });
});

/**
 * Builds the staged note whose property holds a markdown link.
 *
 * @returns The note's Markdown.
 */
function buildSourceNote(): string {
  return '---\n'
    + 'related: "[Chapter two](<./Chapter two.md>)"\n'
    + 'source: "[Obsidian Help](https://help.obsidian.md)"\n'
    + '---\n'
    + '# Chapter one\n\n'
    + 'The links that matter here are the ones in the properties above.\n';
}

/**
 * Clears the notices floating over the settings modal before the frame is taken.
 *
 * The suggestion is surfaced twice on purpose — a notice on load and a banner in this tab — and on a fresh
 * profile both are on screen at once, with the notice sitting on top of the banner it duplicates. That reads
 * as a rendering fault rather than as two deliberate placements, so the frame shows the banner alone.
 */
async function dismissNotices(): Promise<void> {
  await evalInObsidian({
    callback() {
      for (const noticeEl of document.querySelectorAll('.notice')) {
        noticeEl.detach();
      }
    },
    vaultPath: vaultPath()
  });
}

/**
 * Opens the target note and its backlinks pane.
 *
 * @returns The text of the backlink entries.
 */
async function openBacklinksForTarget(): Promise<string> {
  return await evalInObsidian({
    async callback({ app, lib: { waitUntil }, targetNotePath }) {
      const RENDER_TIMEOUT_IN_MILLISECONDS = 20_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 1500;
      const RESIZE_SETTLE_DELAY_IN_MILLISECONDS = 2000;

      await sleep(RESIZE_SETTLE_DELAY_IN_MILLISECONDS);

      const file = app.vault.getFileByPath(targetNotePath);
      if (!file) {
        throw new Error(`Note is missing from the vault: ${targetNotePath}`);
      }

      await app.workspace.getLeaf(false).openFile(file);

      const backlinkPlugin = app.internalPlugins.getPluginById('backlink');
      await backlinkPlugin?.enable();
      app.commands.executeCommandById('backlink:open');
      app.workspace.rightSplit.expand();

      await waitUntil({
        message: 'the backlinks pane to list the source note',
        predicate: () => document.querySelectorAll('.backlink-pane .tree-item-inner').length > 0,
        timeoutInMilliseconds: RENDER_TIMEOUT_IN_MILLISECONDS
      });

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);

      return [...document.querySelectorAll('.backlink-pane .tree-item-inner')]
        .map((entry) => entry.textContent)
        .join(' ');
    },
    input: { targetNotePath: TARGET_NOTE_PATH },
    vaultPath: vaultPath()
  });
}

/**
 * Opens a staged note and reports whether its properties hold a real link.
 *
 * @param path - Vault-relative path of the note.
 * @returns What the property turned into.
 */
async function openNoteAndReadProperty(path: string): Promise<unknown> {
  return await evalInObsidian({
    async callback({ app, lib: { waitUntil }, obsidianModule, path: notePath }) {
      const RENDER_TIMEOUT_IN_MILLISECONDS = 20_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 1500;
      const RESIZE_SETTLE_DELAY_IN_MILLISECONDS = 2000;

      // Let the previous shot's capture settle: the device-metrics override it
      // Sets and clears disturbs anything opened too soon afterwards.
      await sleep(RESIZE_SETTLE_DELAY_IN_MILLISECONDS);

      const file = app.vault.getFileByPath(notePath);
      if (!file) {
        throw new Error(`Note is missing from the vault: ${notePath}`);
      }

      const leaf = app.workspace.getLeaf(false);
      await leaf.openFile(file);
      await leaf.setViewState({
        state: { file: notePath, mode: 'preview', source: false },
        type: 'markdown'
      });

      await waitUntil({
        message: 'the properties to render',
        predicate: () => Boolean(document.querySelector('.metadata-property')),
        timeoutInMilliseconds: RENDER_TIMEOUT_IN_MILLISECONDS
      });

      // Reopening a note Obsidian has already rendered reuses that render, so
      // The frame taken straight after toggling the plugin showed the PREVIOUS
      // State — a rendered link in the shot whose point is that there is none.
      const view: unknown = app.workspace.getActiveViewOfType(obsidianModule.MarkdownView);
      (view as null | PreviewRenderView)?.previewMode.rerender(true);

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);

      // A rendered LINK inside a property row is the whole difference. Obsidian
      // Draws property links as divs carrying `.metadata-link-inner`, not as
      // Anchors, so looking for an <a> found nothing even with the plugin on.
      const link = document.querySelector('.metadata-property-value .metadata-link-inner');
      return {
        hasLink: Boolean(link),
        linkText: link?.textContent ?? null
      };
    },
    input: { path },
    vaultPath: vaultPath()
  });
}

/**
 * Captures the window, captions it, and writes it as
 * `images/screenshots/screenshot-desktop-<index>.png`.
 *
 * @param index - The 1-based listing position.
 * @param caption - The caption drawn across the bottom of the frame.
 */
async function shoot(index: number, caption: string): Promise<void> {
  const bytes = await captureObsidianScreenshot({
    heightInPixels: HEIGHT_IN_PIXELS,
    vaultPath: vaultPath(),
    widthInPixels: WIDTH_IN_PIXELS
  });

  const labeled = await labelScreenshot(bytes, { text: caption });

  expect(readPngDimensions(labeled)).toStrictEqual({
    heightInPixels: HEIGHT_IN_PIXELS,
    widthInPixels: WIDTH_IN_PIXELS
  });

  mkdirSync(IMAGES_DIRECTORY, { recursive: true });
  writeFileSync(join(IMAGES_DIRECTORY, `screenshot-desktop-${String(index)}.png`), labeled);
}

function vaultPath(): string {
  return getTemporaryVault().path;
}

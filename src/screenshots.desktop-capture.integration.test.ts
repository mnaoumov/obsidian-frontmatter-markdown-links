/**
 * @file
 *
 * Produces the desktop screenshots the community-store listing needs,
 * driving staged notes in a real Obsidian and writing
 * `images/screenshots/screenshot-desktop-N.png`.
 *
 * THREE shots: several links in one property, each rendered as a real link, the backlink that only
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
 * The staged property holds SEVERAL links, because Obsidian draws a value that
 * is one link as a link by itself: a frame of that would show nothing the
 * plugin does. There is deliberately NO plugin-off frame; the demo vault's
 * `02 Backlinks` shows the difference live, which a still cannot.
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
  applyObsidianTheme,
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

const WIDTH_IN_PIXELS = 1200;
const HEIGHT_IN_PIXELS = 800;

const SOURCE_NOTE_PATH = 'Screenshots/Chapter one.md';
const TARGET_NOTE_PATH = 'Screenshots/Chapter two.md';
const PROLOGUE_NOTE_PATH = 'Screenshots/Prologue.md';

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
    [PROLOGUE_NOTE_PATH]: '# Prologue\n\nThe other note the property points at.\n',
    [SOURCE_NOTE_PATH]: buildSourceNote(),
    [TARGET_NOTE_PATH]: '# Chapter two\n\nThe note the property points at.\n'
  });
  await vault.syncToDevice();

  // Not a bare `app.changeTheme`: that only schedules the config save, and a config reload landing first
  // drops the theme, so every frame comes out light. This saves at once, waits for the theme to land, and
  // makes `captureObsidianScreenshot` refuse a frame that has left it.
  await applyObsidianTheme({ theme: 'dark', vaultPath: vaultPath() });

  await evalInObsidian({
    async callback({ app, lib: { waitUntil }, sourceNotePath }) {
      /*
       * Under the transport's ~30s per-closure cap, not at it. At 30_000 this ceiling was unreachable: the
       * whole eval is killed at the cap first, and reported as a bare transport timeout naming the harness
       * rather than the wait that overran — and the settle below shares the same budget, so the closure was
       * already over it before the wait began. What is waited on here lands in well under a second.
       */
      const SETTLE_TIMEOUT_IN_MILLISECONDS = 20_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 1000;

      await waitUntil({
        message: 'the staged notes to appear in the vault',
        predicate: () => Boolean(app.vault.getFileByPath(sourceNotePath)),
        timeoutInMilliseconds: SETTLE_TIMEOUT_IN_MILLISECONDS
      });

      // The properties panel is the subject, so it has to be in the document
      // rather than tucked into a side pane.
      app.vault.setConfig('propertiesInDocument', 'visible');

      app.workspace.leftSplit.collapse();

      app.vault.setConfig('showInlineTitle', false);
      app.updateInlineTitleDisplay();

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);
    },
    input: { sourceNotePath: SOURCE_NOTE_PATH },
    vaultPath: vaultPath()
  });
});

describe('desktop store screenshots', () => {
  it('1 - several links in one property, each rendered as a real link', async () => {
    const probe = await openNoteAndReadProperty(SOURCE_NOTE_PATH);
    expect(probe).toEqual({ relatedLinkTexts: ['Prologue', 'Chapter two'] });
    await shoot(1, 'Several links in one property become real links');
  });

  it('2 - the backlink it produces', async () => {
    const backlinks = await openBacklinksForTarget();
    // A still cannot show a click; a backlink on the TARGET is
    // visible proof the link actually resolved.
    expect(backlinks).toContain('Chapter one');
    await shoot(2, 'And the target counts them as backlinks');
  });

  it('3 - the settings it exposes', async () => {
    const names = await openObsidianSettingsTab({ tabId: PLUGIN_ID, vaultPath: vaultPath() });
    // The rows the tab drew ARE the proof it rendered, so asserting on one is
    // what separates this from a frame of an empty modal. The frame also carries the
    // banner suggesting `Advanced Rename and Delete Handler`, which owns rename handling
    // since 3.0.0 — that row is deliberately unnamed, so the named toggle is what
    // there is to assert on here.
    expect(names).toContain('Should show initialization notice');
    await shoot(3, 'Rename handling now lives in a companion plugin');
  });
});

/**
 * Builds the staged note whose `related` property holds two links, a wikilink and a markdown link. A
 * value that is ONE link is drawn as a link by Obsidian itself, so it would show nothing of the plugin.
 *
 * @returns The note's Markdown.
 */
function buildSourceNote(): string {
  return '---\n'
    + 'related: "[[Prologue]] and [Chapter two](<./Chapter two.md>)"\n'
    + 'source: "[Obsidian Help](https://help.obsidian.md)"\n'
    + '---\n'
    + '# Chapter one\n\n'
    + 'The links that matter here are the ones in the properties above.\n';
}

/**
 * Clears the floating notices before a frame is taken.
 *
 * Every shot wants the subject, not the plugin talking over it. The suggestion notice in particular is
 * persistent — it carries buttons, so it waits for an answer rather than timing out — and in the settings
 * frame it lands on top of the banner it duplicates, which reads as a rendering fault rather than as the two
 * deliberate placements it is.
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
      // sets and clears disturbs anything opened too soon afterwards.
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
      // the frame taken straight after toggling the plugin showed the PREVIOUS
      // state — a rendered link in the shot whose point is that there is none.
      app.workspace.getActiveViewOfType(obsidianModule.MarkdownView)?.previewMode.rerender(true);

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);

      // A rendered LINK inside a property row is the whole difference. Obsidian
      // draws property links as divs carrying `.metadata-link-inner`, not as
      // anchors, so looking for an <a> found nothing even with the plugin on.
      // With the plugin on, Obsidian's own single collapsed link stays in the row, hidden, beside the
      // plugin's two, so only the visible ones are the frame's subject.
      return {
        relatedLinkTexts: [...document.querySelectorAll('.metadata-property[data-property-key="related"] .metadata-link-inner')]
          .filter((link) => link.checkVisibility())
          .map((link) => link.textContent)
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
  await dismissNotices();

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

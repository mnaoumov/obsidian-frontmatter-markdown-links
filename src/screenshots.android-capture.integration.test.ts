/**
 * @file
 *
 * Produces the mobile screenshots the community-store listing needs
 * (T461-P21), driving staged notes in Obsidian Mobile on a real Android
 * emulator and writing images/screenshots/screenshot-mobile-N.png.
 *
 * The mobile counterpart of the desktop capture suite, showing the same two
 * frames. See the desktop suite for why there is no plugin-off frame.
 *
 * There is no mobile equivalent of the desktop viewport override, so the AVD is
 * built at exactly 900x1600 — see [[T461-P21]] for its one-time provisioning.
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
 * App, reduced to the font-size applier that obsidian-typings does not declare.
 * Setting baseFontSize alone changes nothing on screen.
 */
interface FontSizeApp {
  updateFontSize(this: void): void;
}

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

const WIDTH_IN_PIXELS = 900;
const HEIGHT_IN_PIXELS = 1600;

/**
 * Base font size for the mobile shots, below the 16px default so a property row
 * and its value share a line on a 450dp screen.
 */
const MOBILE_FONT_SIZE_IN_PIXELS = 13;

const SOURCE_NOTE_PATH = 'Screenshots/Chapter one.md';
const TARGET_NOTE_PATH = 'Screenshots/Chapter two.md';

const IMAGES_DIRECTORY = join(process.cwd(), 'images', 'screenshots');

beforeAll(async () => {
  const vault = getTemporaryVault();

  vault.populate({
    [SOURCE_NOTE_PATH]: buildSourceNote(),
    [TARGET_NOTE_PATH]: '# Chapter two\n\nThe note the property points at.\n'
  });
  await vault.syncToDevice();

  await evalInObsidian({
    async callback({ app, fontSizeInPixels, lib: { waitUntil }, sourceNotePath }) {
      // A closure runs inside ONE Appium execute/sync call, which WebDriver caps
      // Around 30s, so every wait in here stays comfortably under it.
      const SETTLE_TIMEOUT_IN_MILLISECONDS = 15_000;
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

      app.vault.setConfig('baseFontSize', fontSizeInPixels);
      const fontApp: unknown = app;
      (fontApp as FontSizeApp).updateFontSize();

      app.vault.setConfig('showInlineTitle', false);
      const inlineTitleApp: unknown = app;
      (inlineTitleApp as InlineTitleApp).updateInlineTitleDisplay();

      await sleep(SETTLE_DELAY_IN_MILLISECONDS);
    },
    input: { fontSizeInPixels: MOBILE_FONT_SIZE_IN_PIXELS, sourceNotePath: SOURCE_NOTE_PATH },
    vaultPath: vaultPath()
  });
});

describe('mobile store screenshots', () => {
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
 * Opens the target note and its backlinks pane.
 *
 * @returns The text of the backlink entries.
 */
async function openBacklinksForTarget(): Promise<string> {
  return await evalInObsidian({
    async callback({ app, lib: { waitUntil }, targetNotePath }) {
      const RENDER_TIMEOUT_IN_MILLISECONDS = 20_000;
      const SETTLE_DELAY_IN_MILLISECONDS = 1500;

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

      // Let the previous shot's capture settle: the device-metrics override it
      // Sets and clears disturbs anything opened too soon afterwards.
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
 * `images/screenshots/screenshot-mobile-<index>.png`.
 *
 * @param index - The 1-based listing position.
 * @param caption - The caption drawn across the bottom of the frame.
 */
async function shoot(index: number, caption: string): Promise<void> {
  const captured = await captureObsidianScreenshot({ vaultPath: vaultPath() });

  // The AVD is 900x1600, so the device frame IS the store size. Asserting it
  // Here is what keeps that true: run this against any other AVD and it fails
  // Loudly instead of quietly shipping an off-spec image.
  expect(readPngDimensions(captured)).toStrictEqual({
    heightInPixels: HEIGHT_IN_PIXELS,
    widthInPixels: WIDTH_IN_PIXELS
  });

  const labeled = await labelScreenshot(captured, { text: caption });

  mkdirSync(IMAGES_DIRECTORY, { recursive: true });
  writeFileSync(join(IMAGES_DIRECTORY, `screenshot-mobile-${String(index)}.png`), labeled);
}

function vaultPath(): string {
  return getTemporaryVault().path;
}

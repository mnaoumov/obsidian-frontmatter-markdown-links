import type { MarkdownView } from 'obsidian';

import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

/*
 * The buttons of `01 Frontmatter markdown links`, checked for what the note says they show.
 *
 * The button suite only checks that each click reports success. These buttons can succeed while showing
 * nothing - a toggle whose panel never redraws, or a Source mode click that finds no link and says so -
 * so the outcome the note promises is asserted here, against the demo vault itself.
 *
 * The note's own claims are pinned too, because they are about OBSIDIAN rather than the plugin: Obsidian
 * draws a property holding one markdown link as a link by itself, and the note says so. If a version
 * stops doing that, this fails and the note has to change with it.
 */

interface DemoSetup {
  readonly closeFrontmatterLinksNoteSourceMode: (app: unknown) => void;
  readonly disablePlugin: (app: unknown, message?: string) => Promise<void>;
  readonly enablePlugin: (app: unknown, message?: string) => Promise<void>;
  readonly modifierClickMarkdownLinkInSourceMode: (app: unknown) => Promise<void>;
  readonly openFrontmatterLinksNoteInSourceMode: (app: unknown) => Promise<void>;
}

interface PropertiesSnapshot {
  readonly markdownLink: string[];
  readonly multipleLinks: string[];
  readonly wikilink: string[];
}

interface SourceModeSnapshot {
  readonly markdownLink: boolean;
  readonly wikilink: boolean;
}

const vault = getTemporaryVault();

const NOTE_PATH = '01 Frontmatter markdown links.md';
const SECOND_TARGET_PATH = 'Targets/Second target.md';
const SCENARIO_TIMEOUT_IN_MS = 120_000;
const RENDER_SETTLE_IN_MS = 1000;

describe('the 01 Frontmatter markdown links buttons', () => {
  it('should redraw multipleLinks as one link while the plugin is off, and as two once it is back', async () => {
    const result = await evalInObsidian({
      async callback({ app, NOTE_PATH: notePath, RENDER_SETTLE_IN_MS: settleMs }) {
        const demoSetup = (window.require as (id: string) => DemoSetup)('/demoSetup.ts');
        const file = app.vault.getFileByPath(notePath);
        if (!file) {
          throw new Error(`${notePath} not found`);
        }

        const leaf = app.workspace.getLeaf(true);
        await leaf.openFile(file);
        await app.workspace.revealLeaf(leaf);
        await (leaf.view as MarkdownView).setState({ mode: 'preview' }, { history: false });
        await sleep(settleMs);

        const on = snapshot();
        await demoSetup.disablePlugin(app);
        await sleep(settleMs);
        const off = snapshot();
        await demoSetup.enablePlugin(app);
        await sleep(settleMs);
        const onAgain = snapshot();

        leaf.detach();
        return { off, on, onAgain };

        function snapshot(): PropertiesSnapshot {
          return {
            markdownLink: visibleLinkTexts('markdownLink'),
            multipleLinks: visibleLinkTexts('multipleLinks'),
            wikilink: visibleLinkTexts('wikilink')
          };
        }

        function visibleLinkTexts(propertyKey: string): string[] {
          // Obsidian lowercases the key in `data-property-key`. With the plugin on, Obsidian's own
          // rendering of the value is still in the row, hidden, beside the plugin's.
          return [...leaf.view.containerEl.querySelectorAll(`.metadata-property[data-property-key="${CSS.escape(propertyKey.toLowerCase())}"] .metadata-link-inner`)]
            .filter((el) => el.checkVisibility())
            .map((el) => el.textContent);
        }
      },
      input: { NOTE_PATH, RENDER_SETTLE_IN_MS },
      vaultPath: vault.path
    });

    const withPlugin = {
      markdownLink: ['Second target'],
      multipleLinks: ['Target note', 'Second target'],
      wikilink: ['Target note']
    };
    expect(result.on).toEqual(withPlugin);
    expect(result.off).toEqual({
      markdownLink: ['Second target'],
      multipleLinks: ['[Target note]] and [Second target'],
      wikilink: ['Target note']
    });
    expect(result.onAgain).toEqual(withPlugin);
  }, SCENARIO_TIMEOUT_IN_MS);

  it('should open a Source mode copy whose markdownLink a modified click follows, and close it again', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { waitUntil }, NOTE_PATH: notePath, RENDER_SETTLE_IN_MS: settleMs, SECOND_TARGET_PATH: secondTargetPath }) {
        const demoSetup = (window.require as (id: string) => DemoSetup)('/demoSetup.ts');
        const file = app.vault.getFileByPath(notePath);
        if (!file) {
          throw new Error(`${notePath} not found`);
        }

        const leaf = app.workspace.getLeaf(true);
        await leaf.openFile(file);
        await app.workspace.revealLeaf(leaf);
        const leavesBefore = new Set(app.workspace.getLeavesOfType('markdown'));

        await demoSetup.openFrontmatterLinksNoteInSourceMode(app);
        await waitUntil({
          message: 'the Source mode copy did not mark the markdownLink line',
          predicate: () => sourceModeSnapshot()?.markdownLink === true
        });
        const sourceModeOn = sourceModeSnapshot();

        await demoSetup.modifierClickMarkdownLinkInSourceMode(app);
        await waitUntil({
          message: 'the modified click did not open the second target',
          predicate: () => openPaths().includes(secondTargetPath)
        });

        await demoSetup.disablePlugin(app);
        await sleep(settleMs);
        const sourceModeOff = sourceModeSnapshot();
        await demoSetup.enablePlugin(app);

        demoSetup.closeFrontmatterLinksNoteSourceMode(app);
        const sourceModeCopiesAfterClose = sourceModeLeaves().length;

        for (const markdownLeaf of app.workspace.getLeavesOfType('markdown')) {
          if (!leavesBefore.has(markdownLeaf)) {
            markdownLeaf.detach();
          }
        }
        leaf.detach();
        return { sourceModeCopiesAfterClose, sourceModeOff, sourceModeOn };

        function openPaths(): string[] {
          return app.workspace.getLeavesOfType('markdown').map((markdownLeaf) => (markdownLeaf.view as MarkdownView).file?.path ?? '');
        }

        function sourceModeLeaves(): MarkdownView[] {
          return app.workspace.getLeavesOfType('markdown')
            .map((markdownLeaf) => markdownLeaf.view as MarkdownView)
            .filter((view) => view.file?.path === notePath && view.getMode() === 'source' && view.getState().source);
        }

        function sourceModeSnapshot(): null | SourceModeSnapshot {
          const [view] = sourceModeLeaves();
          if (!view) {
            return null;
          }
          return {
            markdownLink: hasLink(view, 'markdownLink'),
            wikilink: hasLink(view, 'wikilink')
          };
        }

        function hasLink(view: MarkdownView, propertyKey: string): boolean {
          const lineEl = [...view.containerEl.querySelectorAll('.cm-line')].find((el) => el.textContent.startsWith(`${propertyKey}:`));
          // Obsidian's own link styling would carry `cm-hmd-internal-link`; the plugin's carries its link data.
          return Boolean(lineEl?.querySelector('[data-frontmatter-markdown-links-link-data], .cm-hmd-internal-link'));
        }
      },
      input: { NOTE_PATH, RENDER_SETTLE_IN_MS, SECOND_TARGET_PATH },
      vaultPath: vault.path
    });

    expect(result.sourceModeOn).toEqual({ markdownLink: true, wikilink: true });
    // With the plugin off, raw YAML holds no link at all - not even the wikilink Obsidian resolves.
    expect(result.sourceModeOff).toEqual({ markdownLink: false, wikilink: false });
    expect(result.sourceModeCopiesAfterClose).toBe(0);
  }, SCENARIO_TIMEOUT_IN_MS);
});

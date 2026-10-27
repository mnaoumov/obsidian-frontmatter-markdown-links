import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

/*
 * The buttons of `02 Backlinks`, checked for what the note says they show.
 *
 * The button suite only checks that each click reports success. A toggle can succeed while the Backlinks
 * pane shows exactly what it showed before, so the outcome the note promises is asserted here, against the
 * demo vault itself.
 *
 * The note's claims about OBSIDIAN are pinned too: a property holding ONE markdown link counts as a backlink
 * with the plugin off, so the note demonstrates with a value holding several links instead. If a version
 * starts counting those natively, or stops counting the single one, this fails and the note has to change
 * with it.
 */

interface BacklinksSnapshot {
  readonly targetNoteBacklinks: string[];
  readonly thirdTargetBacklinks: string[];
  readonly thirdTargetPane: string[];
}

interface DemoSetup {
  readonly disablePlugin: (app: unknown, message?: string) => Promise<void>;
  readonly enablePlugin: (app: unknown, message?: string) => Promise<void>;
  readonly showThirdTargetBacklinks: (app: unknown) => Promise<void>;
}

const vault = getTemporaryVault();

const TARGET_NOTE_PATH = 'Targets/Target note.md';
const THIRD_TARGET_PATH = 'Targets/Third target.md';
const SCENARIO_TIMEOUT_IN_MS = 120_000;
const RENDER_SETTLE_IN_MS = 2000;

describe('the 02 Backlinks buttons', () => {
  it('should drop the multi-link backlink from Third target while the plugin is off, and bring it back', async () => {
    const result = await evalInObsidian({
      async callback({ app, RENDER_SETTLE_IN_MS: settleMs, TARGET_NOTE_PATH: targetNotePath, THIRD_TARGET_PATH: thirdTargetPath }) {
        const demoSetup = (window.require as (id: string) => DemoSetup)('/demoSetup.ts');

        await demoSetup.showThirdTargetBacklinks(app);
        await sleep(settleMs);
        const on = snapshot();
        await demoSetup.disablePlugin(app);
        await sleep(settleMs);
        const off = snapshot();
        await demoSetup.enablePlugin(app);
        await sleep(settleMs);
        const onAgain = snapshot();

        for (const leaf of app.workspace.getLeavesOfType('backlink')) {
          leaf.detach();
        }
        return { off, on, onAgain };

        function snapshot(): BacklinksSnapshot {
          return {
            targetNoteBacklinks: backlinkSources(targetNotePath),
            thirdTargetBacklinks: backlinkSources(thirdTargetPath),
            thirdTargetPane: [...document.querySelectorAll('.workspace-leaf-content[data-type="backlink"] .search-result-file-title .tree-item-inner')]
              .filter((el) => el.checkVisibility())
              .map((el) => el.textContent)
          };
        }

        function backlinkSources(path: string): string[] {
          const file = app.vault.getFileByPath(path);
          if (!file) {
            throw new Error(`${path} not found`);
          }
          return [...app.metadataCache.getBacklinksForFile(file).keys()].sort();
        }
      },
      input: { RENDER_SETTLE_IN_MS, TARGET_NOTE_PATH, THIRD_TARGET_PATH },
      vaultPath: vault.path
    });

    const withPlugin = {
      // `related` (a wikilink) and `reference` (a single markdown link) count natively, plugin or not.
      targetNoteBacklinks: ['01 Frontmatter markdown links.md', '02 Backlinks.md'],
      thirdTargetBacklinks: ['02 Backlinks.md'],
      thirdTargetPane: ['02 Backlinks']
    };
    expect(result.on).toEqual(withPlugin);
    expect(result.off).toEqual({
      targetNoteBacklinks: ['01 Frontmatter markdown links.md', '02 Backlinks.md'],
      thirdTargetBacklinks: [],
      thirdTargetPane: []
    });
    expect(result.onAgain).toEqual(withPlugin);
  }, SCENARIO_TIMEOUT_IN_MS);
});

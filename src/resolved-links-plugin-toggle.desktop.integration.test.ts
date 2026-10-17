import type { TFile } from 'obsidian';

import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

/*
 * The plugin adds the links held in a multi-link property to Obsidian's link counts. It used to only ever
 * add to `resolvedLinks`: the counts stayed when the plugin was turned off, and every re-enable added the
 * same links once more. An open Backlinks pane did not follow either way, keeping its old list.
 *
 * The test toggles the plugin twice and reads the source note's counts and the target's Backlinks pane
 * after each step: Obsidian's own counts with the plugin off, those plus the property's links with it on.
 */

interface BacklinkDomInternals {
  resultDomLookup: Map<TFile, unknown>;
}

interface BacklinkInternals {
  backlinkDom: BacklinkDomInternals;
}

interface BacklinkViewInternals {
  backlink: BacklinkInternals;
  file: null | TFile;
}

interface ToggleStep {
  counts: string;
  frontmatterLinks: string;
  isPluginLoaded: boolean;
  paneSources: string[];
  step: string;
}

const vault = getTemporaryVault();

const PLUGIN_ID = 'frontmatter-markdown-links';
const SCENARIO_TIMEOUT_IN_MS = 120_000;

beforeAll(() => {
  vault.populate({
    'resolved-links-source.md': `---
related: "[Target A](resolved-links-target-a.md) and [Target B](resolved-links-target-b.md)"
---
Body link to [[resolved-links-target-b]].
`,
    'resolved-links-target-a.md': '# Target A\n',
    'resolved-links-target-b.md': '# Target B\n'
  });
});

describe('the plugin toggled off and on twice', () => {
  it('should count the property links exactly once while on, not at all while off, and redraw the Backlinks pane', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { waitUntil }, PLUGIN_ID: pluginId }) {
        const SOURCE_PATH = 'resolved-links-source.md';
        const TARGET_A_PATH = 'resolved-links-target-a.md';
        const ON_COUNTS = JSON.stringify({ 'resolved-links-target-a.md': 1, 'resolved-links-target-b.md': 2 });
        const OFF_COUNTS = JSON.stringify({ 'resolved-links-target-b.md': 1 });

        const targetA = app.vault.getFileByPath(TARGET_A_PATH);
        if (!targetA) {
          throw new Error('The scenario notes were not found.');
        }

        function counts(): string {
          const row = app.metadataCache.resolvedLinks[SOURCE_PATH] ?? {};
          return JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b))));
        }

        // One entry per distinct list across every Backlinks pane on target A, so a pane that lags behind
        // the others shows as a second entry.
        function paneSources(): string[] {
          const lists = new Set<string>();
          for (const leaf of app.workspace.getLeavesOfType('backlink')) {
            const view = leaf.view as Partial<BacklinkViewInternals>;
            if (view.file?.path !== TARGET_A_PATH || !view.backlink) {
              continue;
            }
            lists.add([...view.backlink.backlinkDom.resultDomLookup.keys()].map((file) => file.path).sort().join(','));
          }
          if (lists.size === 0) {
            // No pane on target A at all: name the backlink leaves there were, so a failure says why.
            return app.workspace.getLeavesOfType('backlink').map((backlinkLeafToDescribe) => `no pane on target A; a backlink leaf has ${JSON.stringify(backlinkLeafToDescribe.getViewState())}`);
          }
          return [...lists];
        }

        // A Backlinks view of its own beside target A. An unlinked Backlinks view follows the active note, and
        // an earlier suite in this ONE Obsidian may have turned `focusNewTab` off, leaving a new tab in the
        // background - so target A is made active by hand before the view opens.
        const leaf = app.workspace.getLeaf(true);
        await leaf.openFile(targetA);
        app.workspace.setActiveLeaf(leaf, { focus: true });
        const backlinkLeaf = app.workspace.getLeaf('split');
        await backlinkLeaf.setViewState({ active: true, state: { file: TARGET_A_PATH }, type: 'backlink' });
        await app.workspace.revealLeaf(backlinkLeaf);
        // A deferred view has neither `file` nor `backlink` until it loads.
        await backlinkLeaf.loadIfDeferred();

        const steps: ToggleStep[] = [];

        async function record(step: string, expectedCounts: string, isSourceInPane: boolean): Promise<void> {
          try {
            await waitUntil({
              message: `${step}: the counts or the Backlinks pane never settled`,
              predicate: () => counts() === expectedCounts && paneSources().join('|') === (isSourceInPane ? SOURCE_PATH : '')
            });
          } catch {
            // Recorded below and asserted outside, so a failure names what was there.
          }
          steps.push({
            counts: counts(),
            frontmatterLinks: JSON.stringify(app.metadataCache.getCache(SOURCE_PATH)?.frontmatterLinks?.map((link) => link.link) ?? []),
            isPluginLoaded: app.plugins.getPlugin(pluginId)?._loaded ?? false,
            paneSources: paneSources(),
            step
          });
        }

        await record('on', ON_COUNTS, true);
        await app.plugins.disablePlugin(pluginId);
        await record('off 1', OFF_COUNTS, false);
        await app.plugins.enablePlugin(pluginId);
        await record('on 1', ON_COUNTS, true);
        await app.plugins.disablePlugin(pluginId);
        await record('off 2', OFF_COUNTS, false);
        await app.plugins.enablePlugin(pluginId);
        await record('on 2', ON_COUNTS, true);

        // Leave the workspace as it was found. Suites that count open leaves run in the same live
        // Obsidian, so a leaked tab fails THEM rather than this one.
        backlinkLeaf.detach();
        leaf.detach();

        return steps;
      },
      input: { PLUGIN_ID },
      vaultPath: vault.path
    });

    const onStep = {
      counts: JSON.stringify({ 'resolved-links-target-a.md': 1, 'resolved-links-target-b.md': 2 }),
      frontmatterLinks: JSON.stringify(['resolved-links-target-a.md', 'resolved-links-target-b.md']),
      isPluginLoaded: true,
      paneSources: ['resolved-links-source.md']
    };
    const offStep = {
      counts: JSON.stringify({ 'resolved-links-target-b.md': 1 }),
      frontmatterLinks: JSON.stringify([]),
      isPluginLoaded: false,
      paneSources: ['']
    };
    expect(result).toEqual([
      { ...onStep, step: 'on' },
      { ...offStep, step: 'off 1' },
      { ...onStep, step: 'on 1' },
      { ...offStep, step: 'off 2' },
      { ...onStep, step: 'on 2' }
    ]);
  }, SCENARIO_TIMEOUT_IN_MS);
});

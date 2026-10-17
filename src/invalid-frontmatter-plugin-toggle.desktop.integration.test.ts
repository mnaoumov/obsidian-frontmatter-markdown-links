import type { MarkdownView } from 'obsidian';

import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

/*
 * The plugin re-synchronizes every open markdown view's properties on load and again on unload, parsing
 * each view's raw frontmatter to do it. A view whose frontmatter is not valid YAML used to throw there,
 * which failed the plugin's unload and left it half-loaded — still listed as enabled, `_loaded` false, and
 * no later toggle brought it back until Obsidian restarted.
 *
 * The test keeps a note with invalid frontmatter open beside a note with two markdown links in one
 * property, turns the plugin off and on, and asserts the plugin ends loaded and still renders both links.
 */

const vault = getTemporaryVault();

const PLUGIN_ID = 'frontmatter-markdown-links';
const SCENARIO_TIMEOUT_IN_MS = 120_000;

beforeAll(() => {
  vault.populate({
    'invalid-frontmatter-source.md': `---
broken: value: it is: not valid YAML
---
# Invalid frontmatter
`,
    'invalid-frontmatter-target-a.md': '# Target A\n',
    'invalid-frontmatter-target-b.md': '# Target B\n',
    'valid-frontmatter-source.md': `---
related: "[Target A](invalid-frontmatter-target-a.md) and [Target B](invalid-frontmatter-target-b.md)"
---
# Valid frontmatter
`
  });
});

describe('a note with invalid frontmatter open while the plugin is toggled', () => {
  it('should leave the plugin loaded and still rendering property links', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { waitUntil }, PLUGIN_ID: pluginId }) {
        const invalidFile = app.vault.getFileByPath('invalid-frontmatter-source.md');
        const validFile = app.vault.getFileByPath('valid-frontmatter-source.md');
        if (!invalidFile || !validFile) {
          throw new Error('The scenario notes were not found.');
        }

        const invalidLeaf = app.workspace.getLeaf(true);
        await invalidLeaf.openFile(invalidFile);
        const validLeaf = app.workspace.getLeaf('split');
        await validLeaf.openFile(validFile);
        // Reveal before waiting: the desktop project runs several suites in ONE Obsidian, so another
        // suite may have left the workspace focused elsewhere and this view would never render.
        await app.workspace.revealLeaf(validLeaf);
        const validView = validLeaf.view as MarkdownView;
        await validView.setState({ mode: 'source', source: false }, { history: false });

        function renderedLinkCount(): number {
          return validView.containerEl.querySelectorAll(':scope .metadata-property[data-property-key="related"] .metadata-property-value .metadata-property-value .internal-link').length;
        }

        await waitUntil({
          message: 'the plugin never rendered the property links before the toggle',
          predicate: () => renderedLinkCount() === 2
        });

        let toggleError: null | string = null;
        try {
          await app.plugins.disablePlugin(pluginId);
          await app.plugins.enablePlugin(pluginId);
        } catch (error) {
          toggleError = String(error);
        }

        const plugin = app.plugins.getPlugin(pluginId);
        const isLoaded = plugin?._loaded ?? false;

        let linkCountAfterToggle = 0;
        if (isLoaded) {
          await waitUntil({
            message: 'the plugin never rendered the property links after the toggle',
            predicate: () => renderedLinkCount() === 2
          });
          linkCountAfterToggle = renderedLinkCount();
        }

        // Leave the workspace as it was found. Suites that count open leaves run in the same live
        // Obsidian, so a leaked tab fails THEM rather than this one.
        validLeaf.detach();
        invalidLeaf.detach();

        return {
          isEnabled: app.plugins.enabledPlugins.has(pluginId),
          isLoaded,
          linkCountAfterToggle,
          toggleError
        };
      },
      input: { PLUGIN_ID },
      vaultPath: vault.path
    });

    expect(result.toggleError).toBeNull();
    expect(result.isEnabled).toBe(true);
    expect(result.isLoaded).toBe(true);
    expect(result.linkCountAfterToggle).toBe(2);
  }, SCENARIO_TIMEOUT_IN_MS);
});

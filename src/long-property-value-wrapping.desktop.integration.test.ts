import type { MarkdownView } from 'obsidian';

import { evalInObsidian } from 'obsidian-integration-testing';
import { getTempVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

/*
 * Issue #37: with the plugin enabled a long text property rendered as a single non-wrapping line that
 * overflowed the visible width; with it disabled the same value wrapped.
 *
 * Cause: when a value mixes a link with surrounding text, the plugin renders each segment as its own
 * `div.metadata-property-value` nested inside another one. Obsidian styles that class
 * `display: flex` with NO `flex-wrap` (so `nowrap`) and `overflow: hidden`, so the segments become
 * flex items on one line and get clipped. Natively the whole value is ONE flex item
 * (`.metadata-input-longtext`, `white-space: pre-wrap`), which is why native wraps.
 *
 * This measures the rendered geometry rather than asserting on CSS text, so it stays true if the fix
 * is achieved a different way.
 */

const vault = getTempVault();

const LONG_TEXT_WORD_COUNT = 60;
const RENDER_SETTLE_IN_MS = 1500;
const SCENARIO_TIMEOUT_IN_MS = 120_000;
// A wrapped block is at least two lines tall; one line is ~the input height. Well clear of both.
const MIN_WRAPPED_HEIGHT_IN_PX = 40;

beforeAll(() => {
  const longText = Array.from({ length: LONG_TEXT_WORD_COUNT }, (_unused, index) => `word${String(index)}`).join(' ');
  vault.populate({
    'wrap-source.md': `---
Description: "${longText} [Wrap target](wrap-target.md) ${longText}"
---
# Source
`,
    'wrap-target.md': '# Wrap target\n'
  });
});

describe('a long property value containing a link wraps (issue #37)', () => {
  it('should not overflow its container on a single line', async () => {
    const result = await evalInObsidian({
      // eslint-disable-next-line unicorn/name-replacements -- `args` is an `obsidian-integration-testing` parameter name.
      args: { RENDER_SETTLE_IN_MS },
      // eslint-disable-next-line unicorn/name-replacements -- `fn` is an `obsidian-integration-testing` parameter name.
      async fn({ app, lib: { waitUntil }, RENDER_SETTLE_IN_MS: settleMs }) {
        const sourceFile = app.vault.getFileByPath('wrap-source.md');
        if (!sourceFile) {
          throw new Error('wrap-source.md not found');
        }

        const leaf = app.workspace.getLeaf(true);
        await leaf.openFile(sourceFile);
        // Reveal before waiting: the desktop project runs several suites in ONE Obsidian, so another
        // Suite may have left the workspace focused elsewhere and this view would never render.
        await app.workspace.revealLeaf(leaf);
        const markdownView = leaf.view as MarkdownView;
        await markdownView.setState({ mode: 'source', source: false }, { history: false });

        await waitUntil({
          message: 'the plugin did not render the property value',
          predicate: () => markdownView.containerEl.querySelector('.frontmatter-markdown-links.text-property-widget-component') !== null
        });
        await sleep(settleMs);

        const widgetEl = markdownView.containerEl.querySelector('.frontmatter-markdown-links.text-property-widget-component');
        if (!(widgetEl instanceof HTMLElement)) {
          throw new TypeError('The plugin widget container was not found.');
        }

        // The plugin's own segment container: the `.metadata-property-value` it creates as a child.
        const segmentsEl = widgetEl.querySelector('.metadata-property-value');
        if (!(segmentsEl instanceof HTMLElement)) {
          throw new TypeError('The plugin segment container was not found.');
        }

        const measurements = {
          clientWidth: segmentsEl.clientWidth,
          error: null,
          offsetHeight: segmentsEl.offsetHeight,
          scrollWidth: segmentsEl.scrollWidth
        };

        // Leave the workspace as it was found. Suites that count open leaves run in the same live
        // Obsidian, so a leaked tab fails THEM rather than this one.
        leaf.detach();
        return measurements;
      },
      vaultPath: vault.path
    });

    expect(result.error).toBeNull();
    // Wrapped content is taller than one input line...
    expect(result.offsetHeight).toBeGreaterThan(MIN_WRAPPED_HEIGHT_IN_PX);
    // ...and does not run off the side. Before the fix the segments sat on one `nowrap` flex line, so
    // `scrollWidth` far exceeded `clientWidth`.
    expect(result.scrollWidth).toBeLessThanOrEqual(result.clientWidth);
  }, SCENARIO_TIMEOUT_IN_MS);
});

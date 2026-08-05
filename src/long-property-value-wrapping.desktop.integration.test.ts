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
    'source.md': `---
Description: "${longText} [Target](target.md) ${longText}"
---
# Source
`,
    'target.md': '# Target\n'
  });
});

describe('a long property value containing a link wraps (issue #37)', () => {
  it('should not overflow its container on a single line', async () => {
    const result = await evalInObsidian({
      // eslint-disable-next-line unicorn/name-replacements -- `args` is an `obsidian-integration-testing` parameter name.
      args: { RENDER_SETTLE_IN_MS },
      // eslint-disable-next-line unicorn/name-replacements -- `fn` is an `obsidian-integration-testing` parameter name.
      async fn({ app, lib: { waitUntil }, RENDER_SETTLE_IN_MS: settleMs }) {
        const sourceFile = app.vault.getFileByPath('source.md');
        if (!sourceFile) {
          throw new Error('source.md not found');
        }

        await app.workspace.getLeaf(true).openFile(sourceFile);
        const markdownView = app.workspace.getActiveFileView() as MarkdownView;
        await markdownView.setState({ mode: 'source', source: false }, { history: false });

        await waitUntil({
          message: 'the plugin did not render the property value',
          predicate: () => document.querySelector('.frontmatter-markdown-links.text-property-widget-component') !== null
        });
        await sleep(settleMs);

        const widgetEl = document.querySelector('.frontmatter-markdown-links.text-property-widget-component');
        if (!(widgetEl instanceof HTMLElement)) {
          throw new TypeError('The plugin widget container was not found.');
        }

        // The plugin's own segment container: the `.metadata-property-value` it creates as a child.
        const segmentsEl = widgetEl.querySelector('.metadata-property-value');
        if (!(segmentsEl instanceof HTMLElement)) {
          throw new TypeError('The plugin segment container was not found.');
        }

        return {
          clientWidth: segmentsEl.clientWidth,
          error: null,
          offsetHeight: segmentsEl.offsetHeight,
          scrollWidth: segmentsEl.scrollWidth
        };
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

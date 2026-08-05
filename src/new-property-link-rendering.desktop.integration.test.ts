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
 * Issue #38: typing a link into a property that was just created did not render it. Flipping the
 * property's type to Text and back made it work, because that forces a fresh render.
 *
 * A just-created property has no value, so the text widget renders with `data === null`. The patch used
 * to return early for non-string data with Obsidian's ORIGINAL context, so the plugin's
 * re-render-on-change wrapper was never installed and the typed value was never re-rendered.
 *
 * `Description:` below is exactly that state — a property present with a null value. The test types
 * into it and blurs, which is what commits the value, and asserts the link renders without any type
 * flipping.
 */

const vault = getTempVault();

const PROPERTY_KEY = 'Description';
const TYPED_VALUE = 'This is a [[new-property-target]]';
const SCENARIO_TIMEOUT_IN_MS = 120_000;

beforeAll(() => {
  vault.populate({
    'new-property-source.md': `---
${PROPERTY_KEY}:
---
# Source
`,
    'new-property-target.md': '# New property target\n'
  });
});

describe('a link typed into a newly created property renders (issue #38)', () => {
  it('should render the link without flipping the property type', async () => {
    const result = await evalInObsidian({
      // eslint-disable-next-line unicorn/name-replacements -- `args` is an `obsidian-integration-testing` parameter name.
      args: { PROPERTY_KEY: PROPERTY_KEY.toLowerCase(), TYPED_VALUE },
      // eslint-disable-next-line unicorn/name-replacements -- `fn` is an `obsidian-integration-testing` parameter name.
      async fn({ app, lib: { waitUntil }, PROPERTY_KEY: propertyKey, TYPED_VALUE: typedValue }) {
        const sourceFile = app.vault.getFileByPath('new-property-source.md');
        if (!sourceFile) {
          throw new Error('new-property-source.md not found');
        }

        const leaf = app.workspace.getLeaf(true);
        await leaf.openFile(sourceFile);
        // Reveal before waiting: the desktop project runs several suites in ONE Obsidian, so another
        // Suite may have left the workspace focused elsewhere and this view would never render.
        await app.workspace.revealLeaf(leaf);
        const markdownView = leaf.view as MarkdownView;
        await markdownView.setState({ mode: 'source', source: false }, { history: false });

        await waitUntil({
          message: 'the property row did not render',
          predicate: () => markdownView.containerEl.querySelector(`.metadata-property[data-property-key="${CSS.escape(propertyKey)}"]`) !== null
        });

        const propertyEl = markdownView.containerEl.querySelector(`.metadata-property[data-property-key="${CSS.escape(propertyKey)}"]`);
        if (!(propertyEl instanceof HTMLElement)) {
          throw new TypeError('The property row was not found.');
        }

        const inputEl = propertyEl.querySelector('.metadata-input-longtext');
        if (!(inputEl instanceof HTMLElement)) {
          throw new TypeError('The property value input was not found.');
        }

        // Type the value and commit it the way the user does: the widget writes through on blur.
        inputEl.focus();
        inputEl.textContent = typedValue;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.blur();

        await waitUntil({
          message: 'the plugin never rendered the typed link',
          predicate: () => propertyEl.querySelector('.internal-link') !== null
        });

        const linkEl = propertyEl.querySelector('.internal-link');
        const renderResult = {
          error: null,
          hasRenderedLink: linkEl !== null,
          linkText: linkEl?.textContent ?? null
        };

        // Leave the workspace as it was found. Suites that count open leaves run in the same live
        // Obsidian, so a leaked tab fails THEM rather than this one.
        leaf.detach();
        return renderResult;
      },
      vaultPath: vault.path
    });

    expect(result.error).toBeNull();
    expect(result.hasRenderedLink).toBe(true);
    expect(result.linkText).toBe('new-property-target');
  }, SCENARIO_TIMEOUT_IN_MS);
});

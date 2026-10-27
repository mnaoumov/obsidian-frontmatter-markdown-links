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
 * A link in a double-quoted frontmatter value was lost as soon as its text contained a double quote
 * escaped the way YAML requires (`\"`). The same link written in a single-quoted value, or with
 * single quotes in its text, rendered fine.
 *
 * The metadata cache was never the problem - Obsidian parses the YAML first, so all three spellings
 * reach it as the same string and the properties panel renders all three. What broke was the editor
 * extension, which reads the RAW line. CodeMirror's YAML tokenizer ends a double-quoted string at
 * the first `"` it meets, escaped or not, so `"[a \"b\"](c.md)"` arrives as three separate nodes;
 * the extension took each node for a whole value, found no link in any of the three fragments, and
 * rendered the line as plain text.
 *
 * The matrix below pins every quoting spelling, both the escaped ones and the ones that always
 * worked, because the fix rewrites how a value's extent is found for all of them.
 */

interface RenderedLinkData {
  url?: string;
}

const vault = getTemporaryVault();

const TARGET_NOTE_NAME = 'quoting-target';
const SCENARIO_TIMEOUT_IN_MS = 120_000;
const RENDER_SETTLE_IN_MS = 1500;

beforeAll(() => {
  vault.populate({
    'quoting-source.md': String.raw`---
double: "[double](<quoting-target.md>)"
doubleEscaped: "[double \"escaped\"](<quoting-target.md>)"
single: '[single](<quoting-target.md>)'
singleEscaped: '[single ''escaped''](<quoting-target.md>)'
singleWithDouble: '[single "double"](<quoting-target.md>)'
multiEscaped: "lead [first \"escaped\"](<quoting-target.md>) mid [second](<quoting-target.md>) tail"
flowList: ["[flow first](<quoting-target.md>)", "[flow second](<quoting-target.md>)"]
withComment: "[commented](<quoting-target.md>)" # a trailing comment
---
# Source
`,
    'quoting-target.md': '# Quoting target\n'
  });
});

describe('a frontmatter link survives every YAML quoting spelling of its value', () => {
  it('should render the same link whether or not the value escapes its quotes', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { waitUntil }, RENDER_SETTLE_IN_MS: settleMs }) {
        const sourceFile = app.vault.getFileByPath('quoting-source.md');
        if (!sourceFile) {
          throw new Error('quoting-source.md not found');
        }

        const leaf = app.workspace.getLeaf(true);
        await leaf.openFile(sourceFile);
        // Reveal before waiting: the desktop project runs several suites in ONE Obsidian, so another
        // suite may have left the workspace focused elsewhere and this view would never render.
        await app.workspace.revealLeaf(leaf);
        const markdownView = leaf.view as MarkdownView;

        // Source mode shows the frontmatter as raw YAML, which is the only place the extension runs.
        await markdownView.setState({ mode: 'source', source: true }, { history: false });
        await waitUntil({
          message: 'the editor did not render the note',
          predicate: () => markdownView.containerEl.querySelector('.cm-line') !== null
        });
        await sleep(settleMs);

        const sourceModeTargets = collectByProperty((lineEl) =>
          [...lineEl.querySelectorAll('[data-frontmatter-markdown-links-link-data]')]
            .map((el) => JSON.parse((el as HTMLElement).dataset['frontmatterMarkdownLinksLinkData'] ?? '{}') as RenderedLinkData)
            .map((linkData) => linkData.url ?? '')
            // Source mode styles a link in several pieces - the text and the target each carry the
            // data attribute - and an escaped value splits further still, because the marked range
            // spans more than one of the tokenizer's spans. Only the distinct targets matter here.
            .unique()
        );

        // Live preview replaces each link with the plugin's own widget, so this is where the text the
        // reader actually sees can be read back. It only reaches the frontmatter when properties are
        // shown as source; with the default setting the properties panel renders them instead, and
        // that panel reads the PARSED value, where no quoting difference survives.
        const previousPropertiesInDocument = app.vault.getConfig('propertiesInDocument');
        app.vault.setConfig('propertiesInDocument', 'source');
        await markdownView.setState({ mode: 'source', source: false }, { history: false });
        await sleep(settleMs);

        const livePreviewTexts = collectByProperty((lineEl) => [...lineEl.querySelectorAll('a')].map((anchorEl) => anchorEl.textContent));

        // Leave the workspace as it was found. Suites that count open leaves run in the same live
        // Obsidian, so a leaked tab fails THEM rather than this one.
        app.vault.setConfig('propertiesInDocument', previousPropertiesInDocument);
        leaf.detach();
        return { livePreviewTexts, sourceModeTargets };

        function collectByProperty(collect: (lineEl: Element) => string[]): Record<string, string[]> {
          const collected: Record<string, string[]> = {};
          for (const lineEl of markdownView.containerEl.querySelectorAll('.cm-line')) {
            const [propertyKey = '', ...rest] = lineEl.textContent.split(':');
            // Only a `key: value` line is a property; the `---` fences and the body are not.
            if (rest.length === 0 || !propertyKey || propertyKey.includes(' ')) {
              continue;
            }
            collected[propertyKey] = collect(lineEl);
          }
          return collected;
        }
      },
      input: { RENDER_SETTLE_IN_MS },
      vaultPath: vault.path
    });

    const targetPath = `${TARGET_NOTE_NAME}.md`;

    // Every spelling resolves to the same note...
    expect(result.sourceModeTargets).toEqual({
      double: [targetPath],
      doubleEscaped: [targetPath],
      flowList: [targetPath],
      multiEscaped: [targetPath],
      single: [targetPath],
      singleEscaped: [targetPath],
      singleWithDouble: [targetPath],
      withComment: [targetPath]
    });

    // ...and reads with its quotes unescaped, exactly as the equivalent single-quoted value does.
    expect(result.livePreviewTexts).toEqual({
      double: ['double'],
      doubleEscaped: ['double "escaped"'],
      flowList: ['flow first', 'flow second'],
      multiEscaped: ['first "escaped"', 'second'],
      single: ['single'],
      singleEscaped: ['single \'escaped\''],
      singleWithDouble: ['single "double"'],
      withComment: ['commented']
    });
  }, SCENARIO_TIMEOUT_IN_MS);
});

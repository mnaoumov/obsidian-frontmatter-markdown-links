import type {
  MarkdownView,
  WorkspaceLeaf
} from 'obsidian';

import {
  ContextId,
  evalInObsidian
} from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

const vault = getTemporaryVault();

interface Context {
  previousFocusNewTab: unknown;
  sourceLeaf: WorkspaceLeaf;
}

const contextId = new ContextId<Context>();

beforeAll(async () => {
  vault.populate({
    'source.md': `---
Linking:
  - "[Target](target.md)"
---
# Source
`,
    'target.md': '# Target\n'
  });

  await evalInObsidian({
    callback: async ({ app, context }) => {
      // "Always focus new tabs" off is part of the reported reproduction. With it off the duplicate
      // background tab is created and stays, so the leaf count reflects every open.
      // The desktop project runs every suite in one Obsidian, so afterAll puts the old value back.
      context.previousFocusNewTab = app.vault.getConfig('focusNewTab');
      app.vault.setConfig('focusNewTab', false);

      const sourceFile = app.vault.getFileByPath('source.md');
      if (!sourceFile) {
        throw new Error('source.md not found');
      }

      const sourceLeaf = app.workspace.getLeaf(true);
      await sourceLeaf.openFile(sourceFile);
      context.sourceLeaf = sourceLeaf;
      // Live preview renders the property editor where the markdown-link pill lives.
      const markdownView = sourceLeaf.view as MarkdownView;
      await markdownView.setState({ mode: 'source', source: false }, { history: false });
    },
    contextId,
    vaultPath: vault.path
  });
});

afterAll(async () => {
  await evalInObsidian({
    callback: ({ app, context }) => {
      app.vault.setConfig('focusNewTab', context.previousFocusNewTab);
    },
    contextId,
    vaultPath: vault.path
  });
  await contextId.dispose();
});

describe('middle-clicking a markdown link in a List property', () => {
  it('should open the target note exactly once', { retry: 2 }, async () => {
    const result = await evalInObsidian({
      callback: async ({ app, context: { sourceLeaf }, lib: { clickElement, waitUntil }, targetPath }) => {
        const OPEN_TIMEOUT_IN_MILLISECONDS = 5000;
        // A duplicate open comes from Obsidian's own `auxclick` handler, a few milliseconds after the plugin's.
        const DUPLICATE_OPEN_SETTLE_IN_MILLISECONDS = 500;
        const LINK_DATA_SELECTOR = '[data-frontmatter-markdown-links-link-data]';

        function countTargetLeaves(): number {
          return app.workspace.getLeavesOfType('markdown')
            .filter((leaf) => (leaf.view as MarkdownView).file?.path === targetPath)
            .length;
        }

        function describeElement(element: Element | null): string {
          if (!element) {
            return 'nothing';
          }
          const classes = [...element.classList].map((className) => `.${className}`).join('');
          return `<${element.tagName.toLowerCase()}${classes}>`;
        }

        // The pill is looked up inside the source note's own view, never the whole document: the first match in
        // the document can belong to another leaf, whose box is empty or elsewhere, and a trusted click aimed at
        // its center opens nothing.
        function findPill(): HTMLElement | null {
          return sourceLeaf.view.containerEl.querySelector<HTMLElement>(LINK_DATA_SELECTOR);
        }

        function getElementAtPillCenter(pill: HTMLElement): Element | null {
          const rect = pill.getBoundingClientRect();
          return pill.doc.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        }

        app.workspace.setActiveLeaf(sourceLeaf, { focus: true });

        await waitUntil({
          message: 'the markdown-link pill did not render in the source note',
          predicate: () => findPill() !== null
        });
        const pill = findPill();
        if (!pill) {
          throw new Error('The markdown-link pill disappeared from the source note');
        }

        try {
          await waitUntil({
            predicate: () => pill.contains(getElementAtPillCenter(pill))
          });
        } catch (error) {
          throw new Error(
            `The markdown-link pill never came on top: the point at its center belongs to ${describeElement(getElementAtPillCenter(pill))}`,
            { cause: error }
          );
        }

        // Recorded on the window in the capture phase, ahead of the plugin's own document-level listener, which
        // stops the event. It tells a click that never arrived apart from one the plugin did not act on.
        const mouseDowns: string[] = [];
        function recordMouseDown(mouseEvent: MouseEvent): void {
          mouseDowns.push(
            `button ${String(mouseEvent.button)}, trusted ${String(mouseEvent.isTrusted)}, on ${describeElement(mouseEvent.target as Element | null)}`
          );
        }
        pill.win.addEventListener('mousedown', recordMouseDown, { capture: true });

        const before = countTargetLeaves();
        try {
          // Browsers fire `mousedown` then `auxclick` (not `click`) for the middle mouse button — which is
          // why this used to hand-build the sequence. One trusted middle click produces all of it, and
          // produces it with `isTrusted === true`, so Obsidian's own link handling actually acts on it.
          await clickElement({ button: 'middle', element: pill });

          try {
            await waitUntil({
              predicate: () => countTargetLeaves() > before,
              timeoutInMilliseconds: OPEN_TIMEOUT_IN_MILLISECONDS
            });
          } catch (error) {
            const activeFilePath = app.workspace.getActiveFile()?.path ?? 'none';
            const mouseDownReport = mouseDowns.length > 0 ? mouseDowns.join('; ') : 'none reached the window';
            throw new Error(
              `The middle click opened no leaf. Mouse downs: ${mouseDownReport}. Active file: ${activeFilePath}.`,
              { cause: error }
            );
          }
        } finally {
          pill.win.removeEventListener('mousedown', recordMouseDown, { capture: true });
        }

        await sleep(DUPLICATE_OPEN_SETTLE_IN_MILLISECONDS);

        return {
          opened: countTargetLeaves() - before
        };
      },
      contextId,
      input: { targetPath: 'target.md' },
      vaultPath: vault.path
    });

    expect(result.opened).toBe(1);
  });
});

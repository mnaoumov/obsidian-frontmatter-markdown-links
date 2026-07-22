import type {
  MarkdownView,
  TFile
} from 'obsidian';

import {
  ContextId,
  evalInObsidian
} from 'obsidian-integration-testing';
import { getTempVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

const vault = getTempVault();

interface Context {
  sourceFile: TFile;
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
    contextId,
    fn: async ({ app, context }) => {
      // "Always focus new tabs" off is part of the reported reproduction. With it off the duplicate
      // Background tab is created and stays, so the leaf count reflects every open.
      app.vault.setConfig('focusNewTab', false);

      const sourceFile = app.vault.getFileByPath('source.md');
      if (!sourceFile) {
        throw new Error('source.md not found');
      }
      context.sourceFile = sourceFile;

      await app.workspace.getLeaf(true).openFile(sourceFile);
      // Live preview renders the property editor where the markdown-link pill lives.
      const markdownView = app.workspace.getActiveFileView() as MarkdownView;
      await markdownView.setState({ mode: 'source', source: false }, { history: false });
      await sleep(1000);
    },
    vaultPath: vault.path
  });
});

afterAll(async () => {
  await contextId.dispose();
});

describe('middle-clicking a markdown link in a List property', () => {
  it('should open the target note exactly once', { retry: 2 }, async () => {
    const result = await evalInObsidian({
      args: { targetPath: 'target.md' },
      contextId,
      fn: async ({ app, targetPath }) => {
        const MIDDLE_BUTTON = 1;

        function countTargetLeaves(): number {
          return app.workspace.getLeavesOfType('markdown')
            .filter((leaf) => (leaf.view as MarkdownView).file?.path === targetPath)
            .length;
        }

        let linkEl: HTMLElement | null = null;
        for (let attempt = 0; attempt < 20; attempt++) {
          linkEl = activeDocument.querySelector<HTMLElement>('[data-frontmatter-markdown-links-link-data]');
          if (linkEl) {
            break;
          }
          await sleep(250);
        }

        if (!linkEl) {
          throw new Error('Rendered markdown-link pill was not found in the property editor');
        }

        const before = countTargetLeaves();

        // Browsers fire `mousedown` then `auxclick` (not `click`) for the middle mouse button.
        linkEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: MIDDLE_BUTTON, cancelable: true }));
        linkEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: MIDDLE_BUTTON, cancelable: true }));
        linkEl.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: MIDDLE_BUTTON, cancelable: true }));

        await sleep(1500);

        const after = countTargetLeaves();
        return {
          opened: after - before
        };
      },
      vaultPath: vault.path
    });

    expect(result.opened).toBe(1);
  });
});

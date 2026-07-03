import type { WorkspaceLeaf } from 'obsidian';

import {
  ContextId,
  evalInObsidian
} from 'obsidian-integration-testing';
import { getTempVault } from 'obsidian-integration-testing/vitest-global-setup';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

const vault = getTempVault();

interface Context {
  leaf: WorkspaceLeaf;
}

const contextId = new ContextId<Context>();

const BASE_CONTENT = [
  'formulas:',
  '  mappedList: \'note.key\'',
  '  mixedScalar: \'"text [[target]]"\'',
  'views:',
  '  - type: table',
  '    name: Test',
  '    order:',
  '      - file.name',
  '      - formula.mappedList',
  '      - formula.mixedScalar',
  ''
].join('\n');

beforeAll(async () => {
  vault.populate({
    'note1.md': `---
key:
  - text [[target]]
  - "[[target]]"
---
# Note1
`,
    'target.md': '# Target\n',
    'test.base': BASE_CONTENT
  });

  await evalInObsidian({
    contextId,
    fn: async ({ app, context }) => {
      const baseFile = app.vault.getFileByPath('test.base');
      if (!baseFile) {
        throw new Error('test.base not found');
      }
      const leaf = app.workspace.getLeaf(true);
      await leaf.openFile(baseFile);
      context.leaf = leaf;
      await sleep(2500);
    },
    vaultPath: vault.path
  });
});

afterAll(async () => {
  await contextId.dispose();
});

describe('mixed-text wikilinks in Bases formula cells', () => {
  it('renders the embedded wikilink in a mapped-list formula cell as an internal link', async () => {
    const result = await evalInObsidian({
      contextId,
      fn: async ({ context }) => {
        const leaf = context.leaf;
        const containerEl = leaf.view.containerEl;

        function findMappedListCell(): HTMLElement | null {
          const cells = Array.from(containerEl.querySelectorAll<HTMLElement>('.bases-td[data-property="formula.mappedList"]'));
          return cells.find((cell) => cell.textContent.includes('text [[target]]') || Boolean(cell.querySelector('[data-frontmatter-markdown-links-link-data]'))) ?? null;
        }

        let cell: HTMLElement | null = null;
        for (let attempt = 0; attempt < 40; attempt++) {
          cell = findMappedListCell();
          if (cell?.querySelector('[data-frontmatter-markdown-links-link-data]')) {
            break;
          }
          await sleep(250);
        }

        return {
          hasLinkData: Boolean(cell?.querySelector('[data-frontmatter-markdown-links-link-data]')),
          html: cell?.innerHTML ?? '(cell not found)',
          internalLinkCount: cell?.querySelectorAll('.internal-link').length ?? 0
        };
      },
      vaultPath: vault.path
    });

    expect(result.hasLinkData).toBe(true);
    // Both the mixed-text element and the pure-wikilink element resolve to `target`.
    expect(result.internalLinkCount).toBeGreaterThanOrEqual(2);
  });

  it('renders the embedded wikilink in a scalar-string formula cell as an internal link', async () => {
    const result = await evalInObsidian({
      contextId,
      fn: async ({ context }) => {
        const leaf = context.leaf;
        const containerEl = leaf.view.containerEl;

        let cell: HTMLElement | null = null;
        for (let attempt = 0; attempt < 40; attempt++) {
          cell = containerEl.querySelector<HTMLElement>('.bases-td[data-property="formula.mixedScalar"]');
          if (cell?.querySelector('[data-frontmatter-markdown-links-link-data]')) {
            break;
          }
          await sleep(250);
        }

        return {
          hasLinkData: Boolean(cell?.querySelector('[data-frontmatter-markdown-links-link-data]')),
          html: cell?.innerHTML ?? '(cell not found)',
          text: cell?.textContent ?? ''
        };
      },
      vaultPath: vault.path
    });

    expect(result.hasLinkData).toBe(true);
    expect(result.text).toContain('text');
  });
});

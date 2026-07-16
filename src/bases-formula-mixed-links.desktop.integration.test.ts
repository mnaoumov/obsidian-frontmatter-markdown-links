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
    async fn({ app, context, lib: { waitUntil } }) {
      const READY_TIMEOUT_IN_MILLISECONDS = 30_000;
      const baseFile = app.vault.getFileByPath('test.base');
      if (!baseFile) {
        throw new Error('test.base not found');
      }
      const leaf = app.workspace.getLeaf(true);
      await leaf.openFile(baseFile);
      context.leaf = leaf;
      // Reveal the leaf so the Bases view actually renders even if another suite left the workspace focused elsewhere.
      await app.workspace.revealLeaf(leaf);
      // Wait on a readiness signal (the Bases table rendering) rather than a fixed delay, so setup tolerates
      // The shared Obsidian instance being slow under full-suite load (desktop runs after android).
      await waitUntil({
        message: 'Bases table cells to render',
        predicate: () => Boolean(leaf.view.containerEl.querySelector('.bases-td')),
        timeoutInMilliseconds: READY_TIMEOUT_IN_MILLISECONDS
      });
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
      async fn({ app, context, lib: { waitUntil } }) {
        const LINK_DATA_TIMEOUT_IN_MILLISECONDS = 25_000;
        const leaf = context.leaf;
        // Re-activate the leaf so its Bases view keeps rendering even if another suite changed focus under load.
        await app.workspace.revealLeaf(leaf);
        const containerEl = leaf.view.containerEl;

        function findMappedListCell(): HTMLElement | null {
          const cells = Array.from(containerEl.querySelectorAll<HTMLElement>('.bases-td[data-property="formula.mappedList"]'));
          return cells.find((cell) => cell.textContent.includes('text [[target]]') || Boolean(cell.querySelector('[data-frontmatter-markdown-links-link-data]'))) ?? null;
        }

        await waitUntil({
          message: 'mapped-list formula cell to render frontmatter-markdown-links link data',
          predicate: () => Boolean(findMappedListCell()?.querySelector('[data-frontmatter-markdown-links-link-data]')),
          timeoutInMilliseconds: LINK_DATA_TIMEOUT_IN_MILLISECONDS
        });

        return {
          internalLinkCount: findMappedListCell()?.querySelectorAll('.internal-link').length ?? 0
        };
      },
      vaultPath: vault.path
    });

    // Both the mixed-text element and the pure-wikilink element resolve to `target`.
    expect(result.internalLinkCount).toBeGreaterThanOrEqual(2);
  });

  it('renders the embedded wikilink in a scalar-string formula cell as an internal link', async () => {
    const result = await evalInObsidian({
      contextId,
      async fn({ app, context, lib: { waitUntil } }) {
        const LINK_DATA_TIMEOUT_IN_MILLISECONDS = 25_000;
        const leaf = context.leaf;
        // Re-activate the leaf so its Bases view keeps rendering even if another suite changed focus under load.
        await app.workspace.revealLeaf(leaf);
        const containerEl = leaf.view.containerEl;

        function findScalarCell(): HTMLElement | null {
          return containerEl.querySelector<HTMLElement>('.bases-td[data-property="formula.mixedScalar"]');
        }

        await waitUntil({
          message: 'scalar-string formula cell to render frontmatter-markdown-links link data',
          predicate: () => Boolean(findScalarCell()?.querySelector('[data-frontmatter-markdown-links-link-data]')),
          timeoutInMilliseconds: LINK_DATA_TIMEOUT_IN_MILLISECONDS
        });

        return {
          text: findScalarCell()?.textContent ?? ''
        };
      },
      vaultPath: vault.path
    });

    expect(result.text).toContain('text');
  });
});

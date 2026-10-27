import type { WorkspaceLeaf } from 'obsidian';

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
    async callback({ app, context, lib: { waitUntil } }) {
      /*
       * Under the transport's ~30s per-closure cap, not at it. At 30_000 this ceiling was unreachable: the
       * whole eval is killed at the cap first, and reported as a bare transport timeout naming the harness
       * rather than the wait that overran. Several waits share this one budget, so the ceiling is sized for
       * their sum; what is waited on here lands in well under a second.
       */
      const READY_TIMEOUT_IN_MILLISECONDS = 20_000;
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
      // the shared Obsidian instance being slow under full-suite load (desktop runs after android).
      await waitUntil({
        message: 'Bases table cells to render',
        predicate: () => Boolean(leaf.view.containerEl.querySelector('.bases-td')),
        timeoutInMilliseconds: READY_TIMEOUT_IN_MILLISECONDS
      });
    },
    contextId,
    vaultPath: vault.path
  });
});

afterAll(async () => {
  await contextId.dispose();
});

describe('mixed-text wikilinks in Bases formula cells', () => {
  it('renders the embedded wikilink in a mapped-list formula cell as an internal link', async () => {
    const result = await evalInObsidian({
      async callback({ app, context, lib: { waitUntil } }) {
        /*
         * Under the transport's ~30s per-closure cap, not at it.
         * Read and deliberately left as it is. This is the closure's only wait, so the 25_000 below is the
         * whole budget, and it was not inherited: `test: stabilize Bases integration with waitUntil and
         * leaf reveal` chose it to stop a Bases view that re-renders late under load from failing the
         * suite.
         * Lowering it to buy margin would undo that, and there is margin to spare already - one wait at
         * 25_000 cannot reach the cap the way several sibling waits can.
         */
        const LINK_DATA_TIMEOUT_IN_MILLISECONDS = 25_000;
        const leaf = context.leaf;
        // Re-activate the leaf so its Bases view keeps rendering even if another suite changed focus under load.
        await app.workspace.revealLeaf(leaf);
        const containerEl = leaf.view.containerEl;

        function findMappedListCell(): HTMLElement | null {
          const cells = [...containerEl.querySelectorAll<HTMLElement>('.bases-td[data-property="formula.mappedList"]')];
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
      contextId,
      vaultPath: vault.path
    });

    // Both the mixed-text element and the pure-wikilink element resolve to `target`.
    expect(result.internalLinkCount).toBeGreaterThanOrEqual(2);
  });

  it('renders the embedded wikilink in a scalar-string formula cell as an internal link', async () => {
    const result = await evalInObsidian({
      async callback({ app, context, lib: { waitUntil } }) {
        /*
         * Under the transport's ~30s per-closure cap, not at it.
         * Read and deliberately left as it is, for the same reason as the sibling closure above: one wait
         * carries the whole budget, and the 25_000 was chosen to stop a late Bases re-render under load
         * from failing the suite rather than inherited from anywhere.
         */
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
      contextId,
      vaultPath: vault.path
    });

    expect(result.text).toContain('text');
  });
});

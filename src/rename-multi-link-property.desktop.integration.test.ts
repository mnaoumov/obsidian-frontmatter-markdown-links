import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

/*
 * Obsidian's own link update rebuilds a frontmatter link from its whole `original` and writes the result
 * back as the whole value, so an offset-carrying link this plugin adds for a multi-link value used to have
 * the renamed note's name written into the value's LAST markdown link, whichever link was renamed. This pins
 * that each rename reaches its own link, wiki or markdown, and leaves the rest of the value as written.
 */

const vault = getTemporaryVault();

const SCENARIO_TIMEOUT_IN_MS = 120_000;

beforeAll(() => {
  vault.populate({
    'rename-multi-a.md': '',
    'rename-multi-b.md': '',
    'rename-multi-source.md': `---
multipleLinks: "[[rename-multi-a]] and [Multi B](<rename-multi-b.md>)"
---
`
  });
});

describe('a rename of a note linked from a multi-link property', () => {
  it('should be written into that note\'s own link and no other', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { waitUntil } }) {
        const renames: [string, string, string][] = [
          ['rename-multi-a.md', 'renamed multi a.md', '[[renamed multi a]]'],
          ['rename-multi-b.md', 'renamed multi b.md', '(<renamed multi b.md>)']
        ];
        const source = app.vault.getFileByPath('rename-multi-source.md');
        if (!source) {
          throw new Error('The scenario notes were not found.');
        }
        await waitUntil({
          message: 'the property links never reached the cache',
          predicate: () => (app.metadataCache.getFileCache(source)?.frontmatterLinks?.length ?? 0) === renames.length
        });

        const written = { text: '' };
        for (const [from, to, expectedLink] of renames) {
          const file = app.vault.getFileByPath(from);
          if (!file) {
            throw new Error(`${from} was not found.`);
          }
          await app.fileManager.renameFile(file, to);

          // The link update writes the source after the rename resolves, and the next rename must see
          // the links the plugin re-caches from what was written.
          try {
            await waitUntil({
              message: `the source was never rewritten for ${from}`,
              predicate: async () => {
                written.text = await app.vault.read(source);
                return written.text.includes(expectedLink)
                  && app.metadataCache.getFileCache(source)?.frontmatterLinks?.some((link) => link.original.includes(expectedLink)) === true;
              }
            });
          } catch {
            // Asserted outside, so a failure shows what was written.
            break;
          }
        }
        return written.text;
      },
      vaultPath: vault.path
    });

    expect(result).toBe(`---
multipleLinks: "[[renamed multi a]] and [Multi B](<renamed multi b.md>)"
---
`);
  }, SCENARIO_TIMEOUT_IN_MS);
});

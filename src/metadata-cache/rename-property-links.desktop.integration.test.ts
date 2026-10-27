import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

/*
 * Since 3.0.0 the plugin rewrites nothing on a rename and leaves it to Obsidian's own link update. The README
 * says Obsidian itself updates a property holding one link, markdown or wiki, and each link of a list
 * property, so this pins it: each target is renamed, with the plugin on, and the raw value Obsidian writes
 * back is read.
 */

const vault = getTemporaryVault();

const SCENARIO_TIMEOUT_IN_MS = 120_000;

beforeAll(() => {
  vault.populate({
    'rename-list.md': '',
    'rename-single.md': '',
    'rename-source.md': `---
singleMarkdownLink: "[Single](<rename-single.md>)"
singleWikilink: "[[rename-wiki]]"
listLinks:
  - "[List](<rename-list.md>)"
---
`,
    'rename-wiki.md': ''
  });
});

describe('a rename of a note linked from a single-link property', () => {
  it('should be written back into the property by Obsidian itself', async () => {
    const result = await evalInObsidian({
      async callback({ app, lib: { waitUntil } }) {
        const renames: [string, string][] = [
          ['rename-single.md', 'renamed single.md'],
          ['rename-wiki.md', 'renamed wiki.md'],
          ['rename-list.md', 'renamed list.md']
        ];
        const source = app.vault.getFileByPath('rename-source.md');
        if (!source) {
          throw new Error('The scenario notes were not found.');
        }
        await waitUntil({
          message: 'the property links never reached the cache',
          predicate: () => (app.metadataCache.getFileCache(source)?.frontmatterLinks?.length ?? 0) === renames.length
        });

        for (const [from, to] of renames) {
          const file = app.vault.getFileByPath(from);
          if (!file) {
            throw new Error(`${from} was not found.`);
          }
          await app.fileManager.renameFile(file, to);
        }

        // The link update writes the source after the rename resolves.
        let text = '';
        try {
          await waitUntil({
            message: 'the source was never rewritten',
            predicate: async () => {
              text = await app.vault.read(source);
              return text.includes('renamed list');
            }
          });
        } catch {
          // Asserted outside, so a failure shows what was written.
        }
        return text;
      },
      vaultPath: vault.path
    });

    expect(result).toBe(`---
singleMarkdownLink: "[Single](<renamed single.md>)"
singleWikilink: "[[renamed wiki]]"
listLinks:
  - "[List](<renamed list.md>)"
---
`);
  }, SCENARIO_TIMEOUT_IN_MS);
});

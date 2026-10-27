import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  beforeAll,
  expect,
  it
} from 'vitest';

const vault = getTemporaryVault();

beforeAll(() => {
  vault.populate({
    'cache-empty.md': '# No frontmatter links\n',
    'cache-source.md': '---\nrelated: "[Alpha](cache-target.md) and [Bravo](cache-target.md)"\n---\n',
    'cache-target.md': '# Target\n'
  });
});

it('restores links from local records after a plugin restart and reaps a deleted processed file', async () => {
  const result = await evalInObsidian({
    callback: async ({ app, lib: { LocalDataStore, waitUntil } }) => {
      const pluginId = 'frontmatter-markdown-links';
      const store = await LocalDataStore.open({ pluginId, storeId: 'frontmatter-links-v1', vaultId: app.appId });
      try {
        await waitUntil({
          message: 'frontmatter links were not indexed',
          predicate: () => app.metadataCache.getCache('cache-source.md')?.frontmatterLinks?.length === 2
        });
        await app.plugins.disablePlugin(pluginId);
        await waitUntil({
          message: 'unload did not drain the processed empty file',
          predicate: async () => await store.get('file:cache-empty.md') !== undefined
        });
        const persisted = await store.get('file:cache-source.md');
        const empty = app.vault.getFileByPath('cache-empty.md');
        if (!empty) {
          throw new Error('The processed file is missing');
        }
        await app.fileManager.trashFile(empty);
        await app.plugins.enablePlugin(pluginId);
        await waitUntil({
          message: 'frontmatter links were not restored after restart',
          predicate: () => app.metadataCache.getCache('cache-source.md')?.frontmatterLinks?.length === 2
        });
        const links = app.metadataCache.getCache('cache-source.md')?.frontmatterLinks?.map((link) => link.link);
        const count = app.metadataCache.resolvedLinks['cache-source.md']?.['cache-target.md'];
        await app.plugins.disablePlugin(pluginId);
        await waitUntil({
          message: 'startup did not reap the deleted processed record',
          predicate: async () => await store.get('file:cache-empty.md') === undefined
        });
        await app.plugins.enablePlugin(pluginId);
        return { count, links, persisted };
      } finally {
        store.close();
      }
    },
    vaultPath: vault.path
  });
  expect(result.links).toEqual(['cache-target.md', 'cache-target.md']);
  expect(result.count).toBe(2);
  expect(result.persisted).toMatchObject({ links: [{ key: 'related' }, { key: 'related' }] });
});

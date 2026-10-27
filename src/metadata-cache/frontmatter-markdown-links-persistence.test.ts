import type {
  App,
  TFile
} from 'obsidian';

import { LocalDataStore } from '@mnaoumov/obsidian-lib/data-stores/local-data-store';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import { IDBFactory } from 'fake-indexeddb';
import {
  beforeEach,
  expect,
  it,
  vi
} from 'vitest';

import { FrontmatterMarkdownLinksCache } from './frontmatter-markdown-links-cache.ts';

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.spyOn(LocalDataStore.prototype, 'exclusive').mockImplementation(async (callback) => await callback());
});

function makeFile(path: string, mtime = 10): TFile {
  return strictProxy<TFile>({ path, stat: { ctime: 1, mtime, size: 20 } });
}

it('persists processed files without links and deletions across restarts', async () => {
  const app = strictProxy<App>({ appId: 'alpha' });
  const file = makeFile('alpha.md');
  const cache = new FrontmatterMarkdownLinksCache();
  await cache.init(app);
  cache.updateFile(file);
  await cache.dispose();

  const reopened = new FrontmatterMarkdownLinksCache();
  await reopened.init(app);
  expect(reopened.isCacheValid(file)).toBe(true);
  reopened.delete(file.path);
  await reopened.dispose();

  const restarted = new FrontmatterMarkdownLinksCache();
  await restarted.init(app);
  expect(restarted.getTrackedFilePaths()).toEqual([]);
  await restarted.dispose();
});

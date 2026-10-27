import type {
  App,
  FrontmatterLinkCache,
  TFile
} from 'obsidian';

import { LocalDataStore } from '@mnaoumov/obsidian-lib/data-stores/local-data-store';
import { noop } from '@mnaoumov/typescript-lib/function';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import { IDBFactory } from 'fake-indexeddb';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { FrontmatterMarkdownLinksCache } from './frontmatter-markdown-links-cache.ts';

const caches: FrontmatterMarkdownLinksCache[] = [];
const app = strictProxy<App>({ appId: 'alpha' });
const link: FrontmatterLinkCache = { key: 'alpha', link: 'bravo.md', original: '[Bravo](bravo.md)' };

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.spyOn(LocalDataStore.prototype, 'exclusive').mockImplementation(async (callback) => await callback());
});

afterEach(async () => {
  await Promise.allSettled(
    caches.splice(0).map(async (cache) => {
      await cache.dispose();
    })
  );
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function createCache(): FrontmatterMarkdownLinksCache {
  const cache = new FrontmatterMarkdownLinksCache();
  caches.push(cache);
  return cache;
}

async function createLegacy(): Promise<IDBDatabase> {
  const request = indexedDB.open('alpha/frontmatter-markdown-links', 1);
  request.onupgradeneeded = (): void => {
    request.result.createObjectStore('file-mtime', { keyPath: 'filePath' });
    request.result.createObjectStore('frontmatter-links', { keyPath: 'filePath' });
  };
  const database = await new Promise<IDBDatabase>((resolve) => {
    request.onsuccess = (): void => {
      resolve(request.result);
    };
  });
  const transaction = database.transaction(['file-mtime', 'frontmatter-links'], 'readwrite');
  const mtimes = transaction.objectStore('file-mtime');
  const links = transaction.objectStore('frontmatter-links');
  mtimes.put({ filePath: 'empty.md', mtime: 10 });
  mtimes.put({ filePath: 'both.md', mtime: 10 });
  mtimes.put({ filePath: 'invalid.md', mtime: 'bad' });
  mtimes.put({ filePath: 1, mtime: 10 });
  links.put({ filePath: 'both.md', links: [link] });
  links.put({ filePath: 'links.md', links: [link] });
  links.put({ filePath: 'invalid.md', links: [null] });
  await new Promise<void>((resolve) => {
    transaction.oncomplete = (): void => {
      resolve();
    };
  });
  return database;
}

function makeFile(path: string, mtime = 10): TFile {
  return strictProxy<TFile>({ path, stat: { ctime: 1, mtime, size: 20 } });
}

async function openStore(vaultId = 'alpha'): Promise<LocalDataStore> {
  return await LocalDataStore.open({ pluginId: 'frontmatter-markdown-links', storeId: 'frontmatter-links-v1', vaultId });
}

describe('file records', () => {
  it('preserves the public link, validity, rename and orphan contracts', async () => {
    const cache = createCache();
    await cache.init(app);
    expect(cache.getFilePaths()).toEqual([]);
    expect(cache.getLinks(makeFile('missing.md'))).toEqual([]);
    expect(cache.getKeys('missing.md')).toEqual([]);
    expect(cache.isCacheValid(makeFile('missing.md'))).toBe(false);
    cache.deleteKey({ filePath: 'missing.md', key: 'alpha' });
    cache.add('alpha.md', link);
    cache.add('alpha.md', { ...link, key: 'bravo' });
    expect(cache.getKeys('alpha.md')).toEqual(['alpha', 'bravo']);
    cache.deleteKey({ filePath: 'alpha.md', key: 'absent' });
    cache.deleteKey({ filePath: 'alpha.md', key: 'alpha' });
    expect(cache.getLinks(makeFile('alpha.md'))).toEqual([{ ...link, key: 'bravo' }]);
    cache.updateFile(makeFile('alpha.md'));
    expect(cache.isCacheValid(makeFile('alpha.md', 11))).toBe(false);
    cache.rename('alpha.md', makeFile('renamed.md', 12));
    expect(cache.getFilePaths()).toEqual(['renamed.md']);
    expect(cache.isCacheValid(makeFile('renamed.md', 12))).toBe(true);
    cache.deleteKey({ filePath: 'renamed.md', key: 'bravo' });
    expect(cache.getFilePaths()).toEqual([]);
    expect(cache.getTrackedFilePaths()).toEqual(['renamed.md']);
    await cache['flush']();
    await cache.dispose();
    const reopened = createCache();
    await reopened.init(app);
    expect(reopened.isCacheValid(makeFile('renamed.md', 12))).toBe(true);
    reopened.rename('missing.md', makeFile('empty.md'));
    reopened.delete('renamed.md');
    await reopened.dispose();
    const restarted = createCache();
    await restarted.init(app);
    expect(restarted.getTrackedFilePaths()).toEqual(['empty.md']);
  });

  it('isolates vaults and ignores writes after disposal', async () => {
    const cache = createCache();
    await cache.init(app);
    cache.updateFile(makeFile('alpha.md'));
    await cache.dispose();
    cache.updateFile(makeFile('ignored.md'));
    cache.delete('alpha.md');
    expect(cache.getTrackedFilePaths()).toEqual(['alpha.md']);
    const other = createCache();
    await other.init(strictProxy<App>({ appId: 'bravo' }));
    expect(other.getTrackedFilePaths()).toEqual([]);
  });

  it('debounces writes and cancels its timer on disposal', async () => {
    const cache = createCache();
    await cache.init(app);
    vi.useFakeTimers();
    const flush = vi.fn<() => Promise<void>>().mockResolvedValue();
    cache['flush'] = flush;
    cache.updateFile(makeFile('alpha.md'));
    cache.add('alpha.md', link);
    await vi.advanceTimersByTimeAsync(5000);
    expect(flush).toHaveBeenCalledOnce();
    cache.delete('alpha.md');
    await cache.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('restart-safe legacy import', () => {
  it('coherently imports both stores, retains mtime-only and links-only paths, and never resurrects deletions', async () => {
    const legacy = await createLegacy();
    legacy.close();
    const cache = createCache();
    await cache.init(app);
    expect(cache.getTrackedFilePaths().sort()).toEqual(['both.md', 'empty.md', 'links.md']);
    expect(cache.isCacheValid(makeFile('empty.md'))).toBe(true);
    expect(cache.isCacheValid(makeFile('links.md'))).toBe(false);
    expect(cache.getLinks(makeFile('both.md'))).toEqual([link]);
    cache.delete('both.md');
    await cache.dispose();
    const reopened = createCache();
    await reopened.init(app);
    expect(reopened.getTrackedFilePaths().sort()).toEqual(['empty.md', 'links.md']);
    const local = await openStore();
    expect(await local.get('legacy-import-v1')).toBe(true);
    local.close();
    // Import deliberately leaves the source intact so a failed commit is recoverable.
    const original = await createLegacy();
    expect(original.objectStoreNames.contains('file-mtime')).toBe(true);
    original.close();
  });

  it('retries an aborted import without committing a marker or a partial prefix', async () => {
    const legacy = await createLegacy();
    legacy.close();
    const commit = vi.spyOn(LocalDataStore.prototype, 'commit').mockRejectedValueOnce(new Error('quota'));
    const failed = createCache();
    await expect(failed.init(app)).rejects.toThrow('quota');
    const store = await openStore();
    expect(await store.entries()).toEqual([]);
    store.close();
    commit.mockRestore();
    const retried = createCache();
    await retried.init(app);
    expect(retried.getTrackedFilePaths()).toContain('both.md');
  });

  it('validates unknown local rows and retains previously committed records during import retry', async () => {
    const legacy = await createLegacy();
    legacy.close();
    const store = await openStore();
    await store.commit({
      entries: [
        ['file:both.md', { links: [], mtime: 20 }],
        ['file:invalid.md', { links: [], mtime: Infinity }],
        ['file:bad-links.md', { links: [{ key: 1 }], mtime: 10 }],
        ['file:null.md', null],
        ['unrelated', true]
      ]
    });
    store.close();
    const cache = createCache();
    await cache.init(app);
    expect(cache.isCacheValid(makeFile('both.md', 20))).toBe(true);
    expect(cache.getTrackedFilePaths().sort()).toEqual(['both.md', 'empty.md', 'links.md']);
  });
});

describe('write and connection lifetime', () => {
  it('keeps a failed batch pending until retry commits it', async () => {
    const cache = createCache();
    await cache.init(app);
    cache.updateFile(makeFile('alpha.md'));
    const commit = vi.spyOn(LocalDataStore.prototype, 'commit').mockRejectedValueOnce(new Error('quota'));
    await expect(cache['flush']()).rejects.toThrow('quota');
    commit.mockRestore();
    await cache['flush']();
    const store = await openStore();
    expect(await store.get('file:alpha.md')).toEqual({ links: [], mtime: 10 });
    store.close();
  });

  it('preserves mutations made during an in-flight commit and serializes concurrent flushes', async () => {
    const cache = createCache();
    await cache.init(app);
    cache.updateFile(makeFile('alpha.md'));
    let release: () => void = noop;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = LocalDataStore.prototype.commit;
    vi.spyOn(LocalDataStore.prototype, 'commit').mockImplementationOnce(async function commitWhilePending(this: LocalDataStore, params) {
      await barrier;
      await original.call(this, params);
    });
    const first = cache['flush']();
    const second = cache['flush']();
    cache.add('alpha.md', link);
    cache.updateFile(makeFile('alpha.md', 20));
    release();
    await Promise.all([first, second]);
    const store = await openStore();
    expect(await store.get('file:alpha.md')).toEqual({ links: [link], mtime: 20 });
    store.close();
  });

  it('closes a connection that finishes opening after unload', async () => {
    const store = await openStore();
    const closed = vi.spyOn(store, 'close');
    let release: (store: LocalDataStore) => void = noop;
    const barrier = new Promise<LocalDataStore>((resolve) => {
      release = resolve;
    });
    vi.spyOn(LocalDataStore, 'open').mockReturnValueOnce(barrier);
    const cache = createCache();
    const initialization = cache.init(app);
    const disposal = cache.dispose();
    release(store);
    await Promise.all([initialization, disposal]);
    expect(closed).toHaveBeenCalledOnce();
  });

  it('closes on drain failure and reports it to the owner of disposal', async () => {
    const cache = createCache();
    await cache.init(app);
    cache.updateFile(makeFile('alpha.md'));
    vi.spyOn(LocalDataStore.prototype, 'commit').mockRejectedValue(new Error('quota'));
    const closed = vi.spyOn(LocalDataStore.prototype, 'close');
    await expect(cache.dispose()).rejects.toThrow('quota');
    expect(closed).toHaveBeenCalledOnce();
  });
});

it('rebuilds when a legacy database exists without either expected store', async () => {
  const request = indexedDB.open('alpha/frontmatter-markdown-links', 1);
  const database = await new Promise<IDBDatabase>((resolve) => {
    request.onsuccess = (): void => {
      resolve(request.result);
    };
  });
  database.close();
  const cache = createCache();
  await cache.init(app);
  expect(cache.getTrackedFilePaths()).toEqual([]);
});

it('rejects an aborted legacy read and closes the source connection for retry', async () => {
  const legacy = await createLegacy();
  legacy.close();
  const { IDBDatabase: Database } = await import('fake-indexeddb');
  const original = Database.prototype.transaction;
  vi.spyOn(Database.prototype, 'transaction').mockImplementation(function abortLegacyRead(this: IDBDatabase, ...arguments_) {
    const transaction = original.apply(this, arguments_);
    if (Array.isArray(arguments_[0]) && arguments_[0].includes('file-mtime')) {
      queueMicrotask(() => {
        transaction.abort();
      });
    }
    return transaction;
  });
  const cache = createCache();
  await expect(cache.init(app)).rejects.toThrow();
  const store = await openStore();
  expect(await store.entries()).toEqual([]);
  store.close();
});

it('reports an IndexedDB request error even when the browser supplies no error object', async () => {
  const { castTo } = await import('@mnaoumov/typescript-lib/object-utils');
  const request = castTo<IDBOpenDBRequest>(new EventTarget());
  Object.defineProperty(request, 'error', { value: null });
  vi.spyOn(indexedDB, 'open').mockReturnValueOnce(request);
  const cache = createCache();
  const read = cache['readLegacy'](app);
  request.dispatchEvent(new Event('error'));
  await expect(read).rejects.toThrow('IDBRequest failed');
});

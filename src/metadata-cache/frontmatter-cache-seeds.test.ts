import type { DataStoreSeedEntry } from '@mnaoumov/obsidian-lib/data-stores/data-store-seeds';
import type {
  App,
  DataAdapter,
  TFile,
  Vault
} from 'obsidian';

import { DataStoreSeeds } from '@mnaoumov/obsidian-lib/data-stores/data-store-seeds';
import { LocalDataStore } from '@mnaoumov/obsidian-lib/data-stores/local-data-store';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
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

const COMPATIBILITY = 'obsidian-lib-7-multi-value-offsets-v1';
const HASH = '00'.repeat(32);
const ORIGINAL = '[Bravo](bravo.md)';
const LINK = { endOffset: ORIGINAL.length, key: 'alpha', link: 'bravo.md', original: ORIGINAL, startOffset: 0 };
const settings = { cacheSharingFolder: 'Plugin data', shouldShareCache: true };
const caches: FrontmatterMarkdownLinksCache[] = [];

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('crypto', { subtle: { digest: vi.fn().mockResolvedValue(new Uint8Array(32).buffer) } });
  vi.spyOn(LocalDataStore.prototype, 'exclusive').mockImplementation(async (callback) => await callback());
  vi.spyOn(DataStoreSeeds.prototype, 'publish').mockResolvedValue(true);
});

afterEach(async () => {
  await Promise.allSettled(
    caches.splice(0).map(async (cache) => {
      await cache.dispose();
    })
  );
  vi.restoreAllMocks();
});

function createApp(files: TFile[] = [file()]): App {
  return strictProxy<App>({
    appId: 'alpha',
    vault: strictProxy<Vault>({
      adapter: strictProxy<DataAdapter>({ read: vi.fn().mockResolvedValue(ORIGINAL) }),
      getFileByPath: vi.fn((path: string) => files.find((entry) => entry.path === path) ?? null),
      getMarkdownFiles: vi.fn(() => files),
      read: vi.fn().mockResolvedValue(ORIGINAL)
    })
  });
}

async function createCache(app: App): Promise<FrontmatterMarkdownLinksCache> {
  const cache = new FrontmatterMarkdownLinksCache();
  caches.push(cache);
  await cache.init(app);
  return cache;
}

function file(path = 'alpha.md', mtime = 10, size = 20): TFile {
  return strictProxy<TFile>({ path, stat: { ctime: 1, mtime, size } });
}

const DEFAULT_SEED_VALUE = { compatibility: COMPATIBILITY, links: [LINK] };

function seed(value: unknown = DEFAULT_SEED_VALUE): DataStoreSeedEntry {
  return castTo<DataStoreSeedEntry>({ hash: HASH, mtime: 10, path: 'alpha.md', size: 20, value });
}

describe('optional seeds', () => {
  it('adopts compatible records and retains processed files without links', async () => {
    const app = createApp([file(), file('empty.md'), file('new.md')]);
    const cache = await createCache(app);
    vi.spyOn(DataStoreSeeds.prototype, 'readLatest').mockResolvedValue([
      seed(),
      { ...seed({ compatibility: COMPATIBILITY, links: [] }), path: 'empty.md' },
      { ...seed(), path: 'deleted.md' }
    ]);
    await cache.adoptSeeds({ app, settings });
    expect(cache.getLinks(file())).toEqual([LINK]);
    expect(cache.isCacheValid(file('empty.md'))).toBe(true);
    expect(cache.isCacheValid(file('new.md'))).toBe(false);
    expect(cache.getTrackedFilePaths().sort()).toEqual(['alpha.md', 'empty.md']);
  });

  it('does no sharing I/O while sharing is disabled or local persistence is unavailable', async () => {
    const app = createApp();
    const cache = await createCache(app);
    const read = vi.spyOn(DataStoreSeeds.prototype, 'readLatest').mockResolvedValue(undefined);
    await cache.adoptSeeds({ app, settings: { ...settings, shouldShareCache: false } });
    await cache.publishSeeds({ app, settings: { ...settings, shouldShareCache: false } });
    const uninitialized = new FrontmatterMarkdownLinksCache();
    await uninitialized.adoptSeeds({ app, settings });
    await cache.dispose();
    await cache.publishSeeds({ app, settings });
    expect(read).not.toHaveBeenCalled();
    expect(DataStoreSeeds.prototype.publish).not.toHaveBeenCalled();
  });

  it('gives partial or absent delivery the ordinary rebuild path', async () => {
    const app = createApp();
    const cache = await createCache(app);
    vi.spyOn(DataStoreSeeds.prototype, 'readLatest').mockResolvedValue(undefined);
    await cache.adoptSeeds({ app, settings });
    expect(cache.isCacheValid(file())).toBe(false);
  });

  it.each([
    null,
    true,
    {},
    { links: [] },
    { compatibility: 'old', links: [] },
    { compatibility: COMPATIBILITY, links: {} },
    ...[null, {}, { ...LINK, key: 1 }, { ...LINK, link: 1 }, { ...LINK, original: 1 }, { ...LINK, displayText: 1 }, { ...LINK, startOffset: -1 }, { ...LINK, startOffset: 0.5 }, { ...LINK, startOffset: 'bad' }, { ...LINK, endOffset: -1 }, { ...LINK, endOffset: 0.5 }, { ...LINK, endOffset: 'bad' }, { ...LINK, endOffset: 0 }, { ...LINK, endOffset: ORIGINAL.length + 1 }, { key: 'alpha', link: 'bravo.md', original: ORIGINAL }, { key: 'alpha', link: 'bravo.md', original: ORIGINAL, startOffset: 0 }, { endOffset: ORIGINAL.length, key: 'alpha', link: 'bravo.md', original: ORIGINAL }].map((entry) => ({ compatibility: COMPATIBILITY, links: [entry] }))
  ])('rejects a corrupt or incompatible payload without hydrating metadata: %j', async (value) => {
    const app = createApp();
    const cache = await createCache(app);
    vi.spyOn(DataStoreSeeds.prototype, 'readLatest').mockResolvedValue([seed(value)]);
    await cache.adoptSeeds({ app, settings });
    expect(cache.getTrackedFilePaths()).toEqual([]);
  });

  it('rejects an entire seed when any payload is malformed, rather than accepting a partial index', async () => {
    const app = createApp();
    const cache = await createCache(app);
    vi.spyOn(DataStoreSeeds.prototype, 'readLatest').mockResolvedValue([seed(), { ...seed(null), path: 'bravo.md' }]);
    await cache.adoptSeeds({ app, settings });
    expect(cache.getLinks(file())).toEqual([]);
  });

  it('rejects stale size or content including equal size and mtime with a different hash', async () => {
    const app = createApp();
    const cache = await createCache(app);
    const read = vi.spyOn(DataStoreSeeds.prototype, 'readLatest');
    read.mockResolvedValue([{ ...seed(), size: 21 }]);
    await cache.adoptSeeds({ app, settings });
    read.mockResolvedValue([{ ...seed(), hash: 'bad' }]);
    await cache.adoptSeeds({ app, settings });
    expect(cache.getTrackedFilePaths()).toEqual([]);
  });

  it('hashes mtime mismatches, reuses equal text with local stats, and never replaces a valid local record', async () => {
    const app = createApp([file('alpha.md', 11)]);
    const cache = await createCache(app);
    const read = vi.spyOn(DataStoreSeeds.prototype, 'readLatest').mockResolvedValue([seed()]);
    await cache.adoptSeeds({ app, settings });
    expect(cache.isCacheValid(file('alpha.md', 11))).toBe(true);
    expect(app.vault.adapter.read).toHaveBeenCalledWith('alpha.md');
    read.mockResolvedValue([seed({ compatibility: COMPATIBILITY, links: [] })]);
    await cache.adoptSeeds({ app, settings });
    expect(cache.getLinks(file())).toEqual([LINK]);
  });

  it('does not adopt a file deleted or changed while validation is reading it', async () => {
    const app = createApp();
    const cache = await createCache(app);
    vi.spyOn(DataStoreSeeds.prototype, 'readLatest').mockResolvedValue([seed()]);
    vi.mocked(app.vault.getFileByPath).mockReturnValueOnce(null);
    await cache.adoptSeeds({ app, settings });
    vi.mocked(app.vault.read).mockImplementationOnce((note) => {
      note.stat.mtime++;
      return Promise.resolve(ORIGINAL);
    });
    await cache.adoptSeeds({ app, settings });
    expect(cache.getTrackedFilePaths()).toEqual([]);
  });

  it('stops adoption on unload even when an awaited read finishes afterward', async () => {
    const app = createApp();
    const cache = await createCache(app);
    vi.spyOn(DataStoreSeeds.prototype, 'readLatest').mockResolvedValue([seed()]);
    const disposals: Promise<void>[] = [];
    vi.mocked(app.vault.read).mockImplementationOnce(() => {
      disposals.push(cache.dispose());
      return Promise.resolve(ORIGINAL);
    });
    await cache.adoptSeeds({ app, settings });
    await Promise.all(disposals);
    expect(cache.getTrackedFilePaths()).toEqual([]);
  });

  it('publishes only stable valid records, including empty processed records', async () => {
    const notes = [file(), file('empty.md'), file('new.md'), file('stale.md'), file('legacy.md')];
    const app = createApp(notes);
    const cache = await createCache(app);
    cache.updateFile(file());
    cache.add('alpha.md', LINK);
    cache.add('alpha.md', { ...LINK, displayText: 'Bravo', key: 'bravo' });
    cache.updateFile(file('empty.md'));
    cache.updateFile(file('stale.md', 9));
    cache.updateFile(file('legacy.md'));
    cache.add('legacy.md', { key: 'alpha', link: 'bravo', original: 'bravo' });
    await cache.publishSeeds({ app, settings });
    expect(DataStoreSeeds.prototype.publish).toHaveBeenCalledWith([
      { ...seed(), value: { compatibility: COMPATIBILITY, links: [LINK, { ...LINK, displayText: 'Bravo', key: 'bravo' }] } },
      { ...seed({ compatibility: COMPATIBILITY, links: [] }), path: 'empty.md' }
    ]);
  });

  it('omits a record mutated while hashing and stops publication after unload', async () => {
    const app = createApp();
    const cache = await createCache(app);
    cache.updateFile(file());
    vi.mocked(app.vault.read).mockImplementationOnce(() => {
      cache.delete('alpha.md');
      return Promise.resolve(ORIGINAL);
    });
    await cache.publishSeeds({ app, settings });
    expect(DataStoreSeeds.prototype.publish).toHaveBeenCalledWith([]);
    cache.updateFile(file());
    vi.mocked(DataStoreSeeds.prototype.publish).mockClear();
    const disposals: Promise<void>[] = [];
    vi.mocked(app.vault.read).mockImplementationOnce(() => {
      disposals.push(cache.dispose());
      return Promise.resolve(ORIGINAL);
    });
    await cache.publishSeeds({ app, settings });
    await Promise.all(disposals);
    expect(DataStoreSeeds.prototype.publish).not.toHaveBeenCalled();
  });

  it('survives sharing errors without losing accepted local writes and rejects dot folders', async () => {
    const app = createApp();
    const cache = await createCache(app);
    cache.updateFile(file());
    vi.spyOn(DataStoreSeeds.prototype, 'readLatest').mockRejectedValue(new Error('offline'));
    await expect(cache.adoptSeeds({ app, settings })).rejects.toThrow('offline');
    await expect(cache.adoptSeeds({ app, settings: { ...settings, cacheSharingFolder: '.hidden' } })).rejects.toThrow('non-dot');
    await expect(cache.dispose()).resolves.toBeUndefined();
  });
});

import type { FrontmatterLinkCache } from 'obsidian';

import { castTo } from 'obsidian-dev-utils/object-utils';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { FrontmatterMarkdownLinksCache } from './frontmatter-markdown-links-cache.ts';

interface CacheWithMockDb {
  cache: FrontmatterMarkdownLinksCache;
  flushStoreActions(): void;
  objectStoreMock: ReturnType<typeof vi.fn>;
  transactionMock: ReturnType<typeof vi.fn>;
}

interface MockTFileLike {
  path: string;
  stat: MockTFileStat;
}

interface MockTFileStat {
  mtime: number;
}

function makeIdbOpenRequest(db: IDBDatabase, upgradeNewVersion?: number): IDBOpenDBRequest {
  const handlers: Partial<Record<string, (evt?: unknown) => void>> = {};
  const req: Record<string, unknown> = {
    addEventListener: vi.fn().mockImplementation((event: string, handler: (evt?: unknown) => void) => {
      handlers[event] = handler;
      if (event === 'success') {
        // Set result before firing upgrade so request.result is available in the upgrade handler.
        req['result'] = db;
        if (upgradeNewVersion !== undefined && handlers['upgradeneeded']) {
          handlers['upgradeneeded']({ newVersion: upgradeNewVersion });
        }
        handler();
      }
    }),
    readyState: 'pending'
  };
  return castTo<IDBOpenDBRequest>(req);
}

function makeIdbRequest(result: unknown): IDBRequest {
  return castTo<IDBRequest>({
    addEventListener: vi.fn().mockImplementation(function mockAddEventListener(this: IDBRequest, event: string, handler: () => void) {
      if (event === 'success') {
        Object.defineProperty(this, 'result', { configurable: true, value: result });
        handler();
      }
    }),
    readyState: 'pending'
  });
}

function makeLink(key: string, link: string, original: string): FrontmatterLinkCache {
  return { displayText: link, key, link, original };
}

function makeTFile(path: string, mtime = 0): MockTFileLike {
  return { path, stat: { mtime } };
}

describe('FrontmatterMarkdownLinksCache', () => {
  beforeEach(() => {
    // The real `debounce` schedules a `setTimeout`; fake timers keep store-action flushes
    // Under the test's control instead of firing 5s later (and throwing on the uninitialized db).
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('getFilePaths', () => {
    it('should return empty array when no files added', () => {
      const cache = new FrontmatterMarkdownLinksCache();

      expect(cache.getFilePaths()).toEqual([]);
    });

    it('should return file paths after adding links', () => {
      const cache = new FrontmatterMarkdownLinksCache();
      cache.add('file1.md', makeLink('key1', 'link1', 'orig1'));

      expect(cache.getFilePaths()).toEqual(['file1.md']);
    });

    it('should return multiple file paths', () => {
      const cache = new FrontmatterMarkdownLinksCache();
      cache.add('file1.md', makeLink('key1', 'link1', 'orig1'));
      cache.add('file2.md', makeLink('key2', 'link2', 'orig2'));

      expect(cache.getFilePaths()).toContain('file1.md');
      expect(cache.getFilePaths()).toContain('file2.md');
    });
  });

  describe('add', () => {
    it('should add a link to the cache', () => {
      const cache = new FrontmatterMarkdownLinksCache();
      const link = makeLink('key1', 'link1', 'orig1');
      cache.add('file1.md', link);

      expect(cache.getLinks(makeTFile('file1.md') as Parameters<typeof cache.getLinks>[0])).toEqual([link]);
    });

    it('should add multiple links to the same file', () => {
      const cache = new FrontmatterMarkdownLinksCache();
      const link1 = makeLink('key1', 'link1', 'orig1');
      const link2 = makeLink('key2', 'link2', 'orig2');
      cache.add('file1.md', link1);
      cache.add('file1.md', link2);

      const links = cache.getLinks(makeTFile('file1.md') as Parameters<typeof cache.getLinks>[0]);
      expect(links).toHaveLength(2);
      expect(links).toContain(link1);
      expect(links).toContain(link2);
    });
  });

  describe('getLinks', () => {
    it('should return empty array for unknown file', () => {
      const cache = new FrontmatterMarkdownLinksCache();

      expect(cache.getLinks(makeTFile('unknown.md') as Parameters<typeof cache.getLinks>[0])).toEqual([]);
    });
  });

  describe('getKeys', () => {
    it('should return empty array for unknown file', () => {
      const cache = new FrontmatterMarkdownLinksCache();

      expect(cache.getKeys('unknown.md')).toEqual([]);
    });

    it('should return keys of links for known file', () => {
      const cache = new FrontmatterMarkdownLinksCache();
      cache.add('file.md', makeLink('key1', 'link1', 'orig1'));
      cache.add('file.md', makeLink('key2', 'link2', 'orig2'));

      expect(cache.getKeys('file.md')).toEqual(['key1', 'key2']);
    });
  });

  describe('delete', () => {
    it('should remove file from cache', () => {
      const cache = new FrontmatterMarkdownLinksCache();
      cache.add('file.md', makeLink('key1', 'link1', 'orig1'));
      cache.delete('file.md');

      expect(cache.getFilePaths()).not.toContain('file.md');
    });

    it('should do nothing when file not in cache', () => {
      const cache = new FrontmatterMarkdownLinksCache();

      expect(() => {
        cache.delete('nonexistent.md');
      }).not.toThrow();
    });

    it('should remove mtime entry along with links', () => {
      const cache = new FrontmatterMarkdownLinksCache();
      const file = makeTFile('file.md', 100);
      cache.updateFile(file as Parameters<typeof cache.updateFile>[0]);
      cache.delete('file.md');

      expect(cache.isCacheValid(file as Parameters<typeof cache.isCacheValid>[0])).toBe(false);
    });
  });

  describe('deleteKey', () => {
    it('should do nothing when file not in cache', () => {
      const cache = new FrontmatterMarkdownLinksCache();

      expect(() => {
        cache.deleteKey({ filePath: 'nonexistent.md', key: 'key1' });
      }).not.toThrow();
    });

    it('should do nothing when key not in file links', () => {
      const cache = new FrontmatterMarkdownLinksCache();
      cache.add('file.md', makeLink('key1', 'link1', 'orig1'));

      cache.deleteKey({ filePath: 'file.md', key: 'nonexistentKey' });

      expect(cache.getLinks(makeTFile('file.md') as Parameters<typeof cache.getLinks>[0])).toHaveLength(1);
    });

    it('should remove link with matching key', () => {
      const cache = new FrontmatterMarkdownLinksCache();
      cache.add('file.md', makeLink('key1', 'link1', 'orig1'));
      cache.add('file.md', makeLink('key2', 'link2', 'orig2'));

      cache.deleteKey({ filePath: 'file.md', key: 'key1' });

      const links = cache.getLinks(makeTFile('file.md') as Parameters<typeof cache.getLinks>[0]);
      expect(links).toHaveLength(1);
      expect(links[0]?.key).toBe('key2');
    });

    it('should delete entire file entry when last key is removed', () => {
      const cache = new FrontmatterMarkdownLinksCache();
      cache.add('file.md', makeLink('key1', 'link1', 'orig1'));

      cache.deleteKey({ filePath: 'file.md', key: 'key1' });

      expect(cache.getFilePaths()).not.toContain('file.md');
    });
  });

  describe('isCacheValid', () => {
    it('should return false when file has no mtime entry', () => {
      const cache = new FrontmatterMarkdownLinksCache();
      const file = makeTFile('file.md', 1000);

      expect(cache.isCacheValid(file as Parameters<typeof cache.isCacheValid>[0])).toBe(false);
    });

    it('should return true when mtime matches', () => {
      const cache = new FrontmatterMarkdownLinksCache();
      const file = makeTFile('file.md', 1000);
      cache.updateFile(file as Parameters<typeof cache.updateFile>[0]);

      expect(cache.isCacheValid(file as Parameters<typeof cache.isCacheValid>[0])).toBe(true);
    });

    it('should return false when mtime has changed', () => {
      const cache = new FrontmatterMarkdownLinksCache();
      cache.updateFile(makeTFile('file.md', 1000) as Parameters<typeof cache.updateFile>[0]);
      const updatedFile = makeTFile('file.md', 2000);

      expect(cache.isCacheValid(updatedFile as Parameters<typeof cache.isCacheValid>[0])).toBe(false);
    });
  });

  describe('updateFile', () => {
    it('should store mtime for file so cache becomes valid', () => {
      const cache = new FrontmatterMarkdownLinksCache();
      const file = makeTFile('file.md', 9999);
      cache.updateFile(file as Parameters<typeof cache.updateFile>[0]);

      expect(cache.isCacheValid(file as Parameters<typeof cache.isCacheValid>[0])).toBe(true);
    });
  });

  describe('rename', () => {
    it('should move links from old path to new file path', () => {
      const cache = new FrontmatterMarkdownLinksCache();
      const link = makeLink('key1', 'link1', 'orig1');
      cache.add('old.md', link);

      const newFile = makeTFile('new.md', 100);
      cache.rename('old.md', newFile as Parameters<typeof cache.rename>[1]);

      expect(cache.getFilePaths()).not.toContain('old.md');
      expect(cache.getFilePaths()).toContain('new.md');
      const newLinks = cache.getLinks(newFile as Parameters<typeof cache.getLinks>[0]);
      expect(newLinks).toHaveLength(1);
      expect(newLinks[0]?.key).toBe('key1');
    });

    it('should handle rename with no existing links', () => {
      const cache = new FrontmatterMarkdownLinksCache();
      const newFile = makeTFile('new.md', 100);

      cache.rename('nonexistent.md', newFile as Parameters<typeof cache.rename>[1]);

      expect(cache.getLinks(newFile as Parameters<typeof cache.getLinks>[0])).toEqual([]);
    });
  });

  describe('db getter', () => {
    it('should throw when db is accessed before init', () => {
      const cache = new FrontmatterMarkdownLinksCache();

      expect(() => {
        cache['processStoreActions']();
      }).toThrow('db is not initialized');
    });
  });

  describe('init', () => {
    let originalIndexedDB: IDBFactory;

    beforeEach(() => {
      originalIndexedDB = activeWindow.indexedDB;
    });

    afterEach(() => {
      Object.defineProperty(activeWindow, 'indexedDB', { configurable: true, value: originalIndexedDB });
    });

    function buildMockDb(fileMtimeData: unknown[] = [], frontmatterLinksData: unknown[] = [], extraDbProps: Partial<IDBDatabase> = {}): IDBDatabase {
      return castTo<IDBDatabase>({
        ...extraDbProps,
        transaction: vi.fn().mockReturnValue({
          objectStore: vi.fn()
            .mockReturnValueOnce({ getAll: vi.fn().mockReturnValue(makeIdbRequest(fileMtimeData)) })
            .mockReturnValueOnce({ getAll: vi.fn().mockReturnValue(makeIdbRequest(frontmatterLinksData)) })
        })
      });
    }

    it('should open indexedDB with correct name on init', async () => {
      const mockDb = buildMockDb();
      const openMock = vi.fn().mockReturnValue(makeIdbOpenRequest(mockDb));
      Object.defineProperty(activeWindow, 'indexedDB', { configurable: true, value: { open: openMock } });

      const cache = new FrontmatterMarkdownLinksCache();
      await cache.init({ appId: 'my-app' } as Parameters<typeof cache.init>[0]);

      expect(openMock).toHaveBeenCalledWith('my-app/frontmatter-markdown-links', 1);
    });

    it('should create two object stores on first version upgrade', async () => {
      const createObjectStoreMock = vi.fn();
      const mockDb = buildMockDb([], [], { createObjectStore: createObjectStoreMock });
      const openMock = vi.fn().mockReturnValue(makeIdbOpenRequest(mockDb, 1));
      Object.defineProperty(activeWindow, 'indexedDB', { configurable: true, value: { open: openMock } });

      const cache = new FrontmatterMarkdownLinksCache();
      await cache.init({ appId: 'test-app' } as Parameters<typeof cache.init>[0]);

      const EXPECTED_STORE_COUNT = 2;
      expect(createObjectStoreMock).toHaveBeenCalledTimes(EXPECTED_STORE_COUNT);
    });

    it('should not create object stores when upgrade version is not 1', async () => {
      const createObjectStoreMock = vi.fn();
      const mockDb = buildMockDb([], [], { createObjectStore: createObjectStoreMock });
      const openMock = vi.fn().mockReturnValue(makeIdbOpenRequest(mockDb, 2));
      Object.defineProperty(activeWindow, 'indexedDB', { configurable: true, value: { open: openMock } });

      const cache = new FrontmatterMarkdownLinksCache();
      await cache.init({ appId: 'test-app' } as Parameters<typeof cache.init>[0]);

      expect(createObjectStoreMock).not.toHaveBeenCalled();
    });

    it('should load existing data from indexedDB during init', async () => {
      const existingFileMtimeEntry = { filePath: 'existing.md', mtime: 500 };
      const existingLinkEntry = { filePath: 'existing.md', links: [makeLink('key1', 'link1', 'orig1')] };

      const mockDb = buildMockDb([existingFileMtimeEntry], [existingLinkEntry]);
      const openMock = vi.fn().mockReturnValue(makeIdbOpenRequest(mockDb));
      Object.defineProperty(activeWindow, 'indexedDB', { configurable: true, value: { open: openMock } });

      const cache = new FrontmatterMarkdownLinksCache();
      await cache.init({ appId: 'test-app' } as Parameters<typeof cache.init>[0]);

      expect(cache.isCacheValid(makeTFile('existing.md', 500) as Parameters<typeof cache.isCacheValid>[0])).toBe(true);
      expect(cache.getFilePaths()).toContain('existing.md');
    });

    it('should reject when IDBRequest fires an error event with an error object', async () => {
      const openMock = vi.fn().mockReturnValue({
        addEventListener: vi.fn().mockImplementation(function mockAddEventListener(this: IDBOpenDBRequest, event: string, handler: () => void) {
          if (event === 'error') {
            Object.defineProperty(this, 'error', { configurable: true, value: new DOMException('IDB error') });
            handler();
          }
        }),
        readyState: 'pending'
      });
      Object.defineProperty(activeWindow, 'indexedDB', { configurable: true, value: { open: openMock } });

      const cache = new FrontmatterMarkdownLinksCache();

      await expect(cache.init({ appId: 'test-app' } as Parameters<typeof cache.init>[0])).rejects.toThrow('IDB error');
    });

    it('should reject with fallback message when error event has null error', async () => {
      const openMock = vi.fn().mockReturnValue({
        addEventListener: vi.fn().mockImplementation(function mockAddEventListener(this: IDBOpenDBRequest, event: string, handler: () => void) {
          if (event === 'error') {
            Object.defineProperty(this, 'error', { configurable: true, value: null });
            handler();
          }
        }),
        readyState: 'pending'
      });
      Object.defineProperty(activeWindow, 'indexedDB', { configurable: true, value: { open: openMock } });

      const cache = new FrontmatterMarkdownLinksCache();

      await expect(cache.init({ appId: 'test-app' } as Parameters<typeof cache.init>[0])).rejects.toThrow('IDBRequest failed');
    });

    it('should return result immediately when IDBRequest readyState is already done', async () => {
      const mockDb = buildMockDb();
      const openMock = vi.fn().mockReturnValue({
        addEventListener: vi.fn(),
        readyState: 'done',
        result: mockDb
      });
      Object.defineProperty(activeWindow, 'indexedDB', { configurable: true, value: { open: openMock } });

      const cache = new FrontmatterMarkdownLinksCache();
      await cache.init({ appId: 'test-app' } as Parameters<typeof cache.init>[0]);

      expect(cache.getFilePaths()).toEqual([]);
    });
  });

  describe('processStoreActions and addStoreAction callbacks', () => {
    function buildCacheWithMockDb(): CacheWithMockDb {
      const mockStore = { commit: vi.fn(), delete: vi.fn(), put: vi.fn() };
      const objectStoreMock = vi.fn().mockReturnValue(mockStore);
      const transactionMock = vi.fn().mockReturnValue({ commit: vi.fn(), objectStore: objectStoreMock });
      const mockDb = castTo<IDBDatabase>({ transaction: transactionMock });

      const cache = new FrontmatterMarkdownLinksCache();
      // Set the private _db directly to skip init() overhead.
      cache['_db'] = mockDb;

      return { cache, flushStoreActions, objectStoreMock, transactionMock };

      // Fire the real debounced callback by flushing the pending fake timer.
      function flushStoreActions(): void {
        vi.runAllTimers();
      }
    }

    it('should execute add store action callback when processStoreActions is called', () => {
      const { cache, flushStoreActions, objectStoreMock } = buildCacheWithMockDb();

      cache.add('file.md', makeLink('key1', 'link1', 'orig1'));

      // Manually trigger the debounced callback to flush store actions.
      flushStoreActions();

      expect(objectStoreMock).toHaveBeenCalledWith('frontmatter-links');
    });

    it('should execute delete store action callback when processStoreActions is called', () => {
      const { cache, flushStoreActions, objectStoreMock } = buildCacheWithMockDb();

      cache.add('file.md', makeLink('key1', 'link1', 'orig1'));
      cache.delete('file.md');

      flushStoreActions();

      expect(objectStoreMock).toHaveBeenCalled();
    });

    it('should execute deleteKey remaining links store action when processStoreActions is called', () => {
      const { cache, flushStoreActions, objectStoreMock } = buildCacheWithMockDb();

      // Add two links then delete one key (leaves one remaining - triggers put not delete).
      cache.add('file.md', makeLink('key1', 'link1', 'orig1'));
      cache.add('file.md', makeLink('key2', 'link2', 'orig2'));
      cache.deleteKey({ filePath: 'file.md', key: 'key1' });

      flushStoreActions();

      expect(objectStoreMock).toHaveBeenCalled();
    });

    it('should execute updateFile store action when processStoreActions is called', () => {
      const { cache, flushStoreActions, objectStoreMock } = buildCacheWithMockDb();

      cache.updateFile(makeTFile('file.md', 1234) as Parameters<typeof cache.updateFile>[0]);

      flushStoreActions();

      expect(objectStoreMock).toHaveBeenCalledWith('file-mtime');
    });

    it('should access db getter when processStoreActions executes with initialized db', () => {
      const { cache, flushStoreActions } = buildCacheWithMockDb();

      cache.add('file.md', makeLink('key1', 'link1', 'orig1'));

      // Should not throw since db is initialized.
      expect(() => {
        flushStoreActions();
      }).not.toThrow();
    });

    it('should clear pending store actions after processStoreActions runs', () => {
      const { cache, flushStoreActions, objectStoreMock } = buildCacheWithMockDb();

      cache.add('file.md', makeLink('key1', 'link1', 'orig1'));
      flushStoreActions();

      // Run again - pendingStoreActions should be empty now.
      objectStoreMock.mockClear();
      flushStoreActions();

      // No store operations executed (no pending actions to process).
      expect(objectStoreMock).not.toHaveBeenCalled();
    });
  });
});

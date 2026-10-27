import type { FrontmatterLinkCacheWithOffsets } from '@mnaoumov/obsidian-lib/frontmatter-link-cache-with-offsets';
import type {
  App,
  FrontmatterLinkCache,
  TFile
} from 'obsidian';

import {
  DataStoreSeeds,
  validateDataStoreSeed
} from '@mnaoumov/obsidian-lib/data-stores/data-store-seeds';
import { DataStoreTransport } from '@mnaoumov/obsidian-lib/data-stores/data-store-transport';
import { LocalDataStore } from '@mnaoumov/obsidian-lib/data-stores/local-data-store';
import { invokeAsyncSafely } from '@mnaoumov/typescript-lib/async';
import { noop } from '@mnaoumov/typescript-lib/function';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';

interface CacheSharingSettings {
  readonly cacheSharingFolder: string;
  readonly shouldShareCache: boolean;
}

interface CheckOffsetsParams {
  readonly link: object;
  readonly original: string;
}

interface FileRecord {
  readonly links: FrontmatterLinkCache[];
  readonly mtime: null | number;
}

interface FrontmatterMarkdownLinksCacheAdoptSeedsParams {
  readonly app: App;
  readonly settings: CacheSharingSettings;
}

interface FrontmatterMarkdownLinksCacheCreateSeedsParams {
  readonly app: App;
  readonly settings: CacheSharingSettings;
}

interface FrontmatterMarkdownLinksCacheDeleteKeyParams {
  readonly filePath: string;
  readonly key: string;
}

interface FrontmatterMarkdownLinksCachePublishSeedsParams {
  readonly app: App;
  readonly settings: CacheSharingSettings;
}

interface FrontmatterMarkdownLinksCacheReadSeedsParams {
  readonly app: App;
  readonly settings: CacheSharingSettings;
}

interface FrontmatterMarkdownLinksCacheWriteSeedsParams {
  readonly app: App;
  readonly settings: CacheSharingSettings;
}

const PLUGIN_ID = 'frontmatter-markdown-links';
const STORE_ID = 'frontmatter-links-v1';
const IMPORT_KEY = 'legacy-import-v1';
const FILE_PREFIX = 'file:';
const FLUSH_INTERVAL_IN_MILLISECONDS = 5000;
// No user option currently changes parsing. Add future interpretation settings here.
const PARSER_COMPATIBILITY = 'obsidian-lib-7-multi-value-offsets-v1';

interface SeedValue {
  readonly compatibility: string;
  readonly links: FrontmatterLinkCacheWithOffsets[];
}

export class FrontmatterMarkdownLinksCache {
  private disposal: null | Promise<void> = null;
  private flushing: null | Promise<void> = null;
  private initialization: null | Promise<void> = null;
  private isDisposed = false;
  private readonly pending = new Map<string, FileRecord | null>();
  private readonly records = new Map<string, FileRecord>();
  private seedWork: null | Promise<void> = null;
  private store: LocalDataStore | null = null;
  private timer: null | number = null;

  public add(filePath: string, link: FrontmatterLinkCache): void {
    const previous = this.records.get(filePath);
    this.setRecord(filePath, { links: [...previous?.links ?? [], { ...link }], mtime: previous?.mtime ?? null });
  }

  public async adoptSeeds(params: FrontmatterMarkdownLinksCacheAdoptSeedsParams): Promise<void> {
    this.seedWork = this.readSeeds(params);
    try {
      await this.seedWork;
    } finally {
      this.seedWork = null;
    }
  }

  public delete(filePath: string): void {
    this.setRecord(filePath, null);
  }

  public deleteKey(params: FrontmatterMarkdownLinksCacheDeleteKeyParams): void {
    const record = this.records.get(params.filePath);
    if (!record?.links.some((link) => link.key === params.key)) {
      return;
    }
    this.setRecord(params.filePath, { ...record, links: record.links.filter((link) => link.key !== params.key) });
  }

  public async dispose(): Promise<void> {
    this.isDisposed = true;
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    this.disposal ??= this.closeAfterDrain();
    await this.disposal;
  }

  public getFilePaths(): string[] {
    return [...this.records].filter(([, record]) => record.links.length > 0).map(([path]) => path);
  }

  public getKeys(filePath: string): string[] {
    return (this.records.get(filePath)?.links ?? []).map((link) => link.key);
  }

  public getLinks(note: TFile): FrontmatterLinkCache[] {
    return (this.records.get(note.path)?.links ?? []).map((link) => ({ ...link }));
  }

  public getTrackedFilePaths(): string[] {
    return [...this.records.keys()];
  }

  public async init(app: App): Promise<void> {
    this.initialization ??= this.initialize(app);
    await this.initialization;
  }

  public isCacheValid(note: TFile): boolean {
    return this.records.get(note.path)?.mtime === note.stat.mtime;
  }

  public async publishSeeds(params: FrontmatterMarkdownLinksCachePublishSeedsParams): Promise<void> {
    this.seedWork = this.writeSeeds(params);
    try {
      await this.seedWork;
    } finally {
      this.seedWork = null;
    }
  }

  public rename(oldFilePath: string, newFile: TFile): void {
    const links = this.records.get(oldFilePath)?.links ?? [];
    this.delete(oldFilePath);
    this.setRecord(newFile.path, { links, mtime: newFile.stat.mtime });
  }

  public updateFile(file: TFile): void {
    this.setRecord(file.path, { links: this.records.get(file.path)?.links ?? [], mtime: file.stat.mtime });
  }

  private async closeAfterDrain(): Promise<void> {
    try {
      // Initialization reports its failure to the caller. Disposal must still release a failed instance
      // so a later initialization can retry the intact legacy source.
      await this.initialization?.catch(noop);
      try {
        await this.seedWork;
      } finally {
        await this.flush();
      }
    } finally {
      this.store?.close();
      this.store = null;
    }
  }

  private createSeeds(params: FrontmatterMarkdownLinksCacheCreateSeedsParams): DataStoreSeeds | null {
    if (!params.settings.shouldShareCache || !this.store || this.isDisposed) {
      return null;
    }
    return new DataStoreSeeds({
      local: this.store,
      share: true,
      transport: new DataStoreTransport({
        adapter: params.app.vault.adapter,
        folder: params.settings.cacheSharingFolder,
        pluginId: PLUGIN_ID,
        storeId: STORE_ID
      })
    });
  }

  private async drain(): Promise<void> {
    const store = ensureNonNullable(this.store);
    while (this.pending.size > 0) {
      const batch = new Map(this.pending);
      const entries: [string, FileRecord][] = [];
      const removedKeys: string[] = [];
      for (const [path, record] of batch) {
        if (record) {
          entries.push([FILE_PREFIX + path, record]);
        } else {
          removedKeys.push(FILE_PREFIX + path);
        }
      }
      await store.commit({ entries, removedKeys });
      for (const [path, record] of batch) {
        if (this.pending.get(path) === record) {
          this.pending.delete(path);
        }
      }
    }
  }

  private async flush(): Promise<void> {
    if (!this.store) {
      return;
    }
    this.flushing ??= this.drain().finally(() => {
      this.flushing = null;
    });
    await this.flushing;
  }

  private async initialize(app: App): Promise<void> {
    const store = await LocalDataStore.open({ pluginId: PLUGIN_ID, storeId: STORE_ID, vaultId: app.appId });
    if (this.isDisposed) {
      store.close();
      return;
    }
    this.store = store;
    try {
      await store.exclusive(async () => {
        if (await store.get(IMPORT_KEY) === true) {
          return;
        }

        const imported = await this.readLegacy(app);
        const existing = new Map(await store.entries());
        await store.commit({
          entries: [
            ...[...imported].filter(([path]) => !existing.has(FILE_PREFIX + path)).map(([path, record]) => [FILE_PREFIX + path, record] as const),
            [IMPORT_KEY, true]
          ]
        });
      });
      for (const [key, value] of await store.entries()) {
        if (key.startsWith(FILE_PREFIX) && checkFileRecord(value)) {
          this.records.set(key.slice(FILE_PREFIX.length), value);
        }
      }
    } catch (error) {
      // Rebuild in memory this run. The intact legacy database is retried at next startup.
      store.close();
      this.store = null;
      throw error;
    }
  }

  private async readLegacy(app: App): Promise<Map<string, FileRecord>> {
    const request = window.indexedDB.open(`${app.appId}/${PLUGIN_ID}`, 1);
    request.onupgradeneeded = (): void => {
      request.result.createObjectStore('file-mtime', { keyPath: 'filePath' });
      request.result.createObjectStore('frontmatter-links', { keyPath: 'filePath' });
    };
    const database = await getResult(request);
    try {
      const names = ['file-mtime', 'frontmatter-links'].filter((name) => database.objectStoreNames.contains(name));
      const imported = new Map<string, FileRecord>();
      if (names.length === 0) {
        return imported;
      }
      const transaction = database.transaction(names, 'readonly');
      const invalidPaths = new Set<string>();
      const completion = new Promise<void>((resolve, reject) => {
        transaction.oncomplete = (): void => {
          resolve();
        };
        transaction.addEventListener('abort', (): void => {
          reject(new Error('Legacy cache read aborted', { cause: transaction.error }));
        });
      });
      // Enqueue both reads before awaiting either for one coherent snapshot.
      const reads = names.map(async (name) => {
        const rows: unknown[] = await getResult(transaction.objectStore(name).getAll());
        for (const row of rows) {
          if (typeof row !== 'object' || row === null || !('filePath' in row) || typeof row.filePath !== 'string') {
            continue;
          }
          const previous = imported.get(row.filePath) ?? { links: [], mtime: null };
          if (name === 'file-mtime' && 'mtime' in row && checkMtime(row.mtime)) {
            imported.set(row.filePath, { ...previous, mtime: row.mtime });
          } else if (name === 'frontmatter-links' && 'links' in row && checkLinks(row.links)) {
            imported.set(row.filePath, { ...previous, links: row.links });
          } else {
            invalidPaths.add(row.filePath);
          }
        }
      });
      await Promise.all([...reads, completion]);
      for (const path of invalidPaths) {
        imported.delete(path);
      }
      return imported;
    } finally {
      database.close();
    }
  }

  private async readSeeds(params: FrontmatterMarkdownLinksCacheReadSeedsParams): Promise<void> {
    const seeds = this.createSeeds(params);
    const entries = await seeds?.readLatest();
    if (!entries || entries.some((entry) => !checkSeedValue(entry.value))) {
      return;
    }
    const { reusable } = await validateDataStoreSeed({
      entries,
      files: params.app.vault.getMarkdownFiles().map((file) => ({ path: file.path, ...file.stat })),
      hashFile: async (path) => await hashText(await params.app.vault.adapter.read(path))
    });
    for (const entry of reusable) {
      const file = params.app.vault.getFileByPath(entry.path);
      if (!file || this.isCacheValid(file) || !checkSeedValue(entry.value)) {
        continue;
      }
      // Verify hashes even for equal statistics: sync tools can preserve both size and mtime.
      const before = { ...file.stat };
      const hash = await hashText(await params.app.vault.read(file));
      if (
        hash !== entry.hash || before.mtime !== file.stat.mtime || before.size !== file.stat.size
        || entry.mtime !== file.stat.mtime || entry.size !== file.stat.size || this.isDisposed
      ) {
        continue;
      }
      this.setRecord(entry.path, { links: entry.value.links, mtime: file.stat.mtime });
    }
  }

  private setRecord(path: string, record: FileRecord | null): void {
    if (this.isDisposed) {
      return;
    }
    if (record) {
      this.records.set(path, record);
    } else {
      this.records.delete(path);
    }
    this.pending.set(path, record);
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
    }
    this.timer = window.setTimeout(() => {
      this.timer = null;
      invokeAsyncSafely(() => this.flush());
    }, FLUSH_INTERVAL_IN_MILLISECONDS);
  }

  private async writeSeeds(params: FrontmatterMarkdownLinksCacheWriteSeedsParams): Promise<void> {
    const seeds = this.createSeeds(params);
    if (!seeds) {
      return;
    }
    const entries = [];
    for (const file of params.app.vault.getMarkdownFiles()) {
      const record = this.records.get(file.path);
      const value = { compatibility: PARSER_COMPATIBILITY, links: record?.links };
      if (record?.mtime !== file.stat.mtime || !checkSeedValue(value)) {
        continue;
      }
      const before = { ...file.stat };
      const hash = await hashText(await params.app.vault.read(file));
      if (this.isDisposed) {
        return;
      }
      if (this.records.get(file.path) !== record || before.mtime !== file.stat.mtime || before.size !== file.stat.size) {
        continue;
      }
      entries.push({
        hash,
        mtime: before.mtime,
        path: file.path,
        size: before.size,
        value: {
          compatibility: PARSER_COMPATIBILITY,
          links: value.links.map((link) => ({
            ...(link.displayText !== undefined && { displayText: link.displayText }),
            endOffset: link.endOffset,
            key: link.key,
            link: link.link,
            original: link.original,
            startOffset: link.startOffset
          }))
        }
      });
    }
    await seeds.publish(entries);
  }
}

function checkFileRecord(value: unknown): value is FileRecord {
  return typeof value === 'object' && value !== null
    && 'mtime' in value && (value.mtime === null || checkMtime(value.mtime))
    && 'links' in value && checkLinks(value.links);
}

function checkLinks(value: unknown): value is FrontmatterLinkCache[] {
  return Array.isArray(value) && value.every((link: unknown) => {
    return typeof link === 'object' && link !== null && 'key' in link && typeof link.key === 'string'
      && 'link' in link && typeof link.link === 'string'
      && 'original' in link && typeof link.original === 'string'
      && (!('displayText' in link) || typeof link.displayText === 'string')
      && checkOffsets({ link, original: link.original });
  });
}

function checkMtime(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function checkOffsets(params: CheckOffsetsParams): boolean {
  const { link, original } = params;
  return (!('startOffset' in link) && !('endOffset' in link))
    || ('startOffset' in link && typeof link.startOffset === 'number' && Number.isSafeInteger(link.startOffset) && link.startOffset >= 0
      && 'endOffset' in link && typeof link.endOffset === 'number' && Number.isSafeInteger(link.endOffset)
      && link.endOffset > link.startOffset && link.endOffset <= original.length);
}

function checkSeedValue(value: unknown): value is SeedValue {
  return typeof value === 'object' && value !== null
    && 'compatibility' in value && value.compatibility === PARSER_COMPATIBILITY
    && 'links' in value && checkLinks(value.links)
    // Offset-less entries are accepted only locally for the legacy import.
    && value.links.every((link) => 'startOffset' in link);
}

async function getResult<T>(request: IDBRequest<T>): Promise<T> {
  return await new Promise((resolve, reject) => {
    request.onsuccess = (): void => {
      resolve(request.result);
    };
    request.addEventListener('error', (): void => {
      reject(request.error ?? new Error('IDBRequest failed'));
    });
  });
}

async function hashText(text: string): Promise<string> {
  const HEX_RADIX = 16;
  const HEX_BYTE_LENGTH = 2;
  // eslint-disable-next-line n/no-unsupported-features/node-builtins -- This is the Obsidian renderer Web Crypto API.
  const hash = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(HEX_RADIX).padStart(HEX_BYTE_LENGTH, '0')).join('');
}

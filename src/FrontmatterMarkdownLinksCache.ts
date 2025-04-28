import type {
  App,
  FrontmatterLinkCache,
  TFile
} from 'obsidian';

import { debounce } from 'obsidian';

interface FileMtimeEntry {
  filePath: string;
  mtime: number;
}

interface FrontmatterLinkEntry {
  filePath: string;
  links: FrontmatterLinkCache[];
}

interface StoreAction {
  action: (store: IDBObjectStore) => void;
  storeName: string;
}

const DB_VERSION = 1;
const FRONTMATTER_LINKS_STORE_NAME = 'frontmatter-links';
const FILE_MTIME_STORE_NAME = 'file-mtime';
const PROCESS_STORE_ACTIONS_DEBOUNCE_INTERVAL_IN_MILLISECONDS = 5000;

export class FrontmatterMarkdownLinksCache {
  private db!: IDBDatabase;

  private readonly fileFrontmatterLinkCacheMap = new Map<string, FrontmatterLinkCache[]>();
  private pathMtimeMap = new Map<string, number>();
  private pendingStoreActions: StoreAction[] = [];
  private processStoreActionsDebounced = debounce(() => {
    this.processStoreActions();
  }, PROCESS_STORE_ACTIONS_DEBOUNCE_INTERVAL_IN_MILLISECONDS);

  public add(filePath: string, link: FrontmatterLinkCache): void {
    let links = this.fileFrontmatterLinkCacheMap.get(filePath);
    if (!links) {
      links = [];
      this.fileFrontmatterLinkCacheMap.set(filePath, links);
    }

    links.push(link);
    this.addStoreAction(FRONTMATTER_LINKS_STORE_NAME, (store) => {
      store.put({ filePath, links });
    });
  }

  public delete(filePath: string): void {
    this.fileFrontmatterLinkCacheMap.delete(filePath);
    this.pathMtimeMap.delete(filePath);
    this.addStoreAction(FRONTMATTER_LINKS_STORE_NAME, (store) => {
      store.delete(filePath);
    });
  }

  public getFilePaths(): string[] {
    return Array.from(this.fileFrontmatterLinkCacheMap.keys());
  }

  public getKeys(filePath: string): string[] {
    const links = this.fileFrontmatterLinkCacheMap.get(filePath) ?? [];
    return links.map((link) => link.key);
  }

  public getLinks(note: TFile): FrontmatterLinkCache[] {
    return this.fileFrontmatterLinkCacheMap.get(note.path) ?? [];
  }

  public async init(app: App): Promise<void> {
    const request = window.indexedDB.open(`${app.appId}/frontmatter-markdown-links`, DB_VERSION);
    request.addEventListener('upgradeneeded', (event) => {
      if (event.newVersion !== 1) {
        return;
      }
      const db = request.result;
      db.createObjectStore(FILE_MTIME_STORE_NAME, {
        keyPath: 'filePath'
      });

      db.createObjectStore(FRONTMATTER_LINKS_STORE_NAME, {
        keyPath: 'filePath'
      });
    });

    const db = await getResult(request);

    this.db = db;
    const transaction = db.transaction([FILE_MTIME_STORE_NAME, FRONTMATTER_LINKS_STORE_NAME], 'readonly');
    const fileMtimeStore = transaction.objectStore(FILE_MTIME_STORE_NAME);
    const fileMtimeEntries = await getResult(fileMtimeStore.getAll()) as FileMtimeEntry[];
    for (const entry of fileMtimeEntries) {
      this.pathMtimeMap.set(entry.filePath, entry.mtime);
    }

    const frontmatterLinksStore = transaction.objectStore(FRONTMATTER_LINKS_STORE_NAME);
    const frontmatterLinksEntries = await getResult(frontmatterLinksStore.getAll()) as FrontmatterLinkEntry[];
    for (const entry of frontmatterLinksEntries) {
      this.fileFrontmatterLinkCacheMap.set(entry.filePath, entry.links);
    }
  }

  public isCacheValid(note: TFile): boolean {
    return this.pathMtimeMap.get(note.path) === note.stat.mtime;
  }

  public rename(oldFilePath: string, newFile: TFile): void {
    const oldLinks = this.fileFrontmatterLinkCacheMap.get(oldFilePath) ?? [];
    this.updateFile(newFile);
    this.delete(oldFilePath);
    for (const link of oldLinks) {
      this.add(newFile.path, link);
    }
  }

  public updateFile(file: TFile): void {
    this.pathMtimeMap.set(file.path, file.stat.mtime);
    this.addStoreAction(FILE_MTIME_STORE_NAME, (store) => {
      store.put({
        filePath: file.path,
        mtime: file.stat.mtime
      });
    });
  }

  private addStoreAction(storeName: string, storeAction: (store: IDBObjectStore) => void): void {
    this.pendingStoreActions.push({ action: storeAction, storeName });
    this.processStoreActionsDebounced();
  }

  private processStoreActions(): void {
    const pendingStoreActions = this.pendingStoreActions;
    this.pendingStoreActions = [];

    const storeNames = pendingStoreActions.map((action) => action.storeName).unique();

    const transaction = this.db.transaction(storeNames, 'readwrite');
    for (const storeAction of pendingStoreActions) {
      const store = transaction.objectStore(storeAction.storeName);
      storeAction.action(store);
    }

    transaction.commit();
  }
}

async function getResult<T>(request: IDBRequest<T>): Promise<T> {
  if (request.readyState === 'done') {
    return request.result;
  }

  return await new Promise((resolve, reject) => {
    request.addEventListener('success', () => {
      resolve(request.result);
    });
    request.addEventListener('error', () => {
      reject(request.error as Error);
    });
  });
}

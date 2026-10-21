import type { FrontmatterLinkCacheWithOffsets } from '@mnaoumov/obsidian-lib/frontmatter-link-cache-with-offsets';
import type {
  CustomArrayDict,
  LinkChangeUpdate,
  LinkUpdate
} from '@obsidian-typings/obsidian-public-latest';
import type { App as AppType } from 'obsidian';

import { noopAsync } from '@mnaoumov/typescript-lib/function';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  describe,
  expect,
  it
} from 'vitest';

import { MultiLinkPropertyUpdatePatchComponent } from './multi-link-property-update-patch-component.ts';

interface FileManagerAccess {
  updateAllLinks: (linkUpdates: LinkUpdate[]) => Promise<void>;
}

interface MetadataCacheAccess {
  updateInternalLinks: (updates: unknown) => Promise<void>;
}

interface Scenario {
  readonly app: AppType;
  readonly nativeReferences: unknown[];
  readonly nativeUpdates: FakeArrayDict<LinkChangeUpdate>[];
}

interface UpdaterAccess {
  fileManager: FileManagerAccess;
  metadataCache: MetadataCacheAccess;
}

const SOURCE_PATH = 'source.md';
const VALUE = '[[a]] and [B](<b.md>)';

let loadedComponent: MultiLinkPropertyUpdatePatchComponent | null = null;

afterEach(() => {
  loadedComponent?.unload();
  loadedComponent = null;
});

class FakeArrayDict<T> {
  public readonly data = new Map<string, T[]>();

  public add(key: string, value: T): void {
    let values = this.data.get(key);
    if (!values) {
      values = [];
      this.data.set(key, values);
    }
    values.push(value);
  }

  public get(key: string): null | T[] {
    return this.data.get(key) ?? null;
  }

  public keys(): string[] {
    return [...this.data.keys()];
  }

  public remove(key: string, value: T): void {
    const values = this.data.get(key);
    if (!values) {
      return;
    }
    values.remove(value);
    if (values.length === 0) {
      this.data.delete(key);
    }
  }
}

function createLink(startOffset: number, endOffset: number, original = VALUE): FrontmatterLinkCacheWithOffsets {
  return {
    endOffset,
    key: 'multipleLinks',
    link: original.slice(startOffset, endOffset),
    original,
    startOffset
  };
}

function createLinkUpdate(reference: unknown): LinkUpdate {
  return castTo<LinkUpdate>({ reference, resolvedFile: null, resolvedPaths: [], sourceFile: null });
}
async function createScenario(value = VALUE): Promise<Scenario> {
  const app = castTo<AppType>(App.createConfigured__({
    files: {
      [SOURCE_PATH]: `---\nmultipleLinks: "${value}"\n---\n`
    }
  }));
  const nativeReferences: unknown[] = [];
  const nativeUpdates: FakeArrayDict<LinkChangeUpdate>[] = [];
  const access = castTo<UpdaterAccess>(app);
  access.fileManager.updateAllLinks = async (linkUpdates): Promise<void> => {
    nativeReferences.push(...linkUpdates.map((linkUpdate) => linkUpdate.reference));
    await noopAsync();
  };
  access.metadataCache.updateInternalLinks = async (updates): Promise<void> => {
    nativeUpdates.push(castTo<FakeArrayDict<LinkChangeUpdate>>(updates));
    await noopAsync();
  };
  loadedComponent = new MultiLinkPropertyUpdatePatchComponent(app);
  loadedComponent.load();
  await noopAsync();
  return { app, nativeReferences, nativeUpdates };
}

async function readSource(app: AppType): Promise<string> {
  const file = app.vault.getFileByPath(SOURCE_PATH);
  if (!file) {
    throw new Error('source not found');
  }
  return await app.vault.read(file);
}

async function runUpdate(scenario: Scenario, links: FrontmatterLinkCacheWithOffsets[], changes: string[]): Promise<void> {
  const access = castTo<UpdaterAccess>(scenario.app);
  const linkUpdates = links.map((link) => createLinkUpdate(link));
  await access.fileManager.updateAllLinks(linkUpdates);
  const dict = new FakeArrayDict<LinkChangeUpdate>();
  for (const [index, linkUpdate] of linkUpdates.entries()) {
    dict.add(SOURCE_PATH, castTo<LinkChangeUpdate>({ change: changes[index], reference: linkUpdate.reference, sourcePath: SOURCE_PATH }));
  }
  await access.metadataCache.updateInternalLinks(castTo<CustomArrayDict<LinkChangeUpdate>>(dict));
}

describe('MultiLinkPropertyUpdatePatchComponent', () => {
  it('should hand Obsidian each offset link as its own span', async () => {
    const scenario = await createScenario();
    const linkUpdates = [createLinkUpdate(createLink(0, 5)), createLinkUpdate(createLink(10, 21))];

    await castTo<UpdaterAccess>(scenario.app).fileManager.updateAllLinks(linkUpdates);

    expect(scenario.nativeReferences.map((reference) => castTo<FrontmatterLinkCacheWithOffsets>(reference).original)).toEqual([
      '[[a]]',
      '[B](<b.md>)'
    ]);
  });

  it('should keep the array it was given and not wrap a stand-in twice', async () => {
    const scenario = await createScenario();
    const linkUpdates = [createLinkUpdate(createLink(0, 5))];
    const access = castTo<UpdaterAccess>(scenario.app);

    await access.fileManager.updateAllLinks(linkUpdates);
    const standIn = linkUpdates[0]?.reference;
    await access.fileManager.updateAllLinks(linkUpdates);

    expect(linkUpdates[0]?.reference).toBe(standIn);
  });

  it('should leave a reference without offsets as it is', async () => {
    const scenario = await createScenario();
    const reference = { key: 'single', link: 'a', original: '[[a]]' };

    await castTo<UpdaterAccess>(scenario.app).fileManager.updateAllLinks([createLinkUpdate(reference)]);

    expect(scenario.nativeReferences).toEqual([reference]);
  });

  it('should splice every renamed span into the value and keep the rest', async () => {
    const scenario = await createScenario();

    await runUpdate(scenario, [createLink(0, 5), createLink(10, 21)], ['[[renamed a]]', '[B](<renamed b.md>)']);

    expect(await readSource(scenario.app)).toContain('multipleLinks: "[[renamed a]] and [B](<renamed b.md>)"');
    expect(scenario.nativeUpdates[0]?.keys()).toEqual([]);
  });

  it('should leave the value stale when it no longer is the one the offsets index', async () => {
    const scenario = await createScenario('[[x]] and [B](<b.md>)');

    await runUpdate(scenario, [createLink(10, 21)], ['[B](<renamed b.md>)']);

    expect(await readSource(scenario.app)).toContain('multipleLinks: "[[x]] and [B](<b.md>)"');
  });

  it('should pass a change it did not make to Obsidian untouched', async () => {
    const scenario = await createScenario();
    const dict = new FakeArrayDict<LinkChangeUpdate>();
    const change = castTo<LinkChangeUpdate>({ change: '[[c]]', reference: { key: 'other' }, sourcePath: 'other.md' });
    dict.add('other.md', change);

    await castTo<UpdaterAccess>(scenario.app).metadataCache.updateInternalLinks(dict);

    expect(scenario.nativeUpdates[0]?.get('other.md')).toEqual([change]);
  });

  it('should skip a source path that is no longer a file', async () => {
    const scenario = await createScenario();
    const access = castTo<UpdaterAccess>(scenario.app);
    const linkUpdates = [createLinkUpdate(createLink(0, 5))];
    await access.fileManager.updateAllLinks(linkUpdates);
    const dict = new FakeArrayDict<LinkChangeUpdate>();
    dict.add('missing.md', castTo<LinkChangeUpdate>({ change: '[[renamed a]]', reference: linkUpdates[0]?.reference, sourcePath: 'missing.md' }));

    await access.metadataCache.updateInternalLinks(dict);

    expect(await readSource(scenario.app)).toContain(`multipleLinks: "${VALUE}"`);
  });
});

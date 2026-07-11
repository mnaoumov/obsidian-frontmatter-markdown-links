import type {
  App,
  CachedMetadata,
  Editor,
  FrontMatterCache,
  Notice as NoticeOriginal,
  TAbstractFile,
  TFile,
  WorkspaceLeaf
} from 'obsidian';
import type { AbortSignalComponent } from 'obsidian-dev-utils/obsidian/components/abort-signal-component';
import type { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';
import type { EditorExtensionRegistrar } from 'obsidian-dev-utils/obsidian/editor-extension-registrar';

import { waitForAllAsyncOperations } from 'obsidian-dev-utils/async';
import { noopAsync } from 'obsidian-dev-utils/function';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { AbortSignalComponent as AbortSignalComponentCls } from 'obsidian-dev-utils/obsidian/components/abort-signal-component';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  App as AppCls,
  MarkdownView,
  TFile as TFileCls
} from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { LinkFixer } from './link-fixer.ts';
import type { PatchedInputElementMap } from './patched-input-element-map.ts';
import type { PluginSettingsComponent } from './plugin-settings-component.ts';

import { PluginSettings } from './plugin-settings.ts';

type AnyFn = (...args: never[]) => unknown;

interface BasesLocal {
  note: BasesNoteProto;
}

interface CacheGetKeysAccess {
  getKeys: ReturnType<typeof vi.fn>;
}

interface CacheInitAccess {
  init: ReturnType<typeof vi.fn>;
}

interface CacheRenameAccess {
  rename: ReturnType<typeof vi.fn>;
}

interface ClearMetadataCacheAccess {
  clearMetadataCache: AnyFn;
}

interface ComponentModuleActual {
  Component: new () => object;
}

interface HandleMetadataCacheChangedAccess {
  handleMetadataCacheChanged: AnyFn;
}

interface InternalPluginsLike {
  getEnabledPluginById: AnyFn;
}

interface LifecycleAugmentApp {
  internalPlugins: InternalPluginsLike;
  vault: VaultGetMarkdownFilesLike;
  workspace: WorkspaceLeavesAndOnLike;
}

interface LinkDataShape {
  isExternalUrl: boolean;
  isWikilink: boolean;
  url: string;
}

interface MockCacheInstanceAccess {
  delete: ReturnType<typeof vi.fn>;
  getFilePaths: ReturnType<typeof vi.fn>;
}

interface ProcessFrontmatterLinksInFileAccess {
  processFrontmatterLinksInFile: AnyFn;
}

interface UpdateResolvedOrUnresolvedLinksCacheAccess {
  updateResolvedOrUnresolvedLinksCache: AnyFn;
}

interface ValidCacheInstance {
  deleteKey: ReturnType<typeof vi.fn>;
  getLinks: ReturnType<typeof vi.fn>;
  isCacheValid: ReturnType<typeof vi.fn>;
}

interface VaultGetMarkdownFilesLike {
  getMarkdownFiles: AnyFn;
}

interface WorkspaceLeavesAndOnLike {
  getLeavesOfType: AnyFn;
  on: AnyFn;
}

class BasesNoteProto {
  public data: Record<string, unknown> = {};
  public get(key: string): unknown {
    return this.data[key];
  }
}

class MockBasesContext {
  public _local: BasesLocal;
  public constructor() {
    // The note's `get` lives on a real prototype so the BasesNoteGetPatchComponent (stubbed) can be
    // Constructed with a real `getPrototypeOf(note)`.
    this._local = { note: new BasesNoteProto() };
  }
}

// Stub the plugin's OWN sibling patch modules as no-op `Component` subclasses so the component's
// Lifecycle loads them as children without driving real patch logic.
vi.mock('./patches/text-property-widget-render-patch-component.ts', async () => {
  const { Component } = await vi.importActual<ComponentModuleActual>('obsidian');
  return { TextPropertyWidgetRenderPatchComponent: class extends Component {} };
});

vi.mock('./patches/abstract-input-suggest-get-value-patch-component.ts', async () => {
  const { Component } = await vi.importActual<ComponentModuleActual>('obsidian');
  return { AbstractInputSuggestGetValuePatchComponent: class extends Component {} };
});

vi.mock('./patches/multitext-property-widget-render-patch-component.ts', async () => {
  const { Component } = await vi.importActual<ComponentModuleActual>('obsidian');
  return { MultitextPropertyWidgetRenderPatchComponent: class extends Component {} };
});

vi.mock('./patches/menu-show-at-mouse-event-patch-component.ts', async () => {
  const { Component } = await vi.importActual<ComponentModuleActual>('obsidian');
  return { MenuShowAtMouseEventPatchComponent: class extends Component {} };
});

vi.mock('./patches/bases-note-get-patch-component.ts', async () => {
  const { Component } = await vi.importActual<ComponentModuleActual>('obsidian');
  return { BasesNoteGetPatchComponent: class extends Component {} };
});

vi.mock('./patches/editor-get-clickable-token-at-patch-component.ts', async () => {
  const { Component } = await vi.importActual<ComponentModuleActual>('obsidian');
  return { EditorGetClickableTokenAtPatchComponent: class extends Component {} };
});

// Stub the bases context constructor extraction (a runtime-coupled sibling module tested on its own).
// The component test drives the patching orchestration, so the resolved constructor is set per run.
vi.mock('@obsidian-typings/obsidian-public-latest/implementations', () => ({
  getBasesContextConstructor: vi.fn()
}));

vi.mock('./frontmatter-links-editor-extension.ts', () => ({
  FrontMatterLinksViewPlugin: { createEditorExtension: vi.fn().mockReturnValue([]) }
}));

const { createMockCacheInstance, mockCacheConstructor } = vi.hoisted(() => {
  function buildMockCacheInstance(): object {
    return {
      add: vi.fn(),
      delete: vi.fn(),
      deleteKey: vi.fn(),
      getFilePaths: vi.fn().mockReturnValue([]),
      getKeys: vi.fn().mockReturnValue([]),
      getLinks: vi.fn().mockReturnValue([]),
      init: vi.fn().mockResolvedValue(undefined),
      isCacheValid: vi.fn().mockReturnValue(false),
      rename: vi.fn(),
      updateFile: vi.fn()
    };
  }

  return {
    createMockCacheInstance: buildMockCacheInstance,
    mockCacheConstructor: vi.fn().mockImplementation(buildMockCacheInstance)
  };
});

vi.mock('./frontmatter-markdown-links-cache.ts', () => ({
  FrontmatterMarkdownLinksCache: mockCacheConstructor
}));

// Stub the RETURN VALUE of specific dev-utils utility functions, spreading the real module so the
// Other exports the real dev-utils components depend on remain intact.
vi.mock('obsidian-dev-utils/obsidian/metadata-cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('obsidian-dev-utils/obsidian/metadata-cache')>();
  return {
    ...actual,
    getCacheSafe: vi.fn().mockResolvedValue(null)
  };
});

vi.mock('obsidian-dev-utils/obsidian/vault', async (importOriginal) => {
  const actual = await importOriginal<typeof import('obsidian-dev-utils/obsidian/vault')>();
  return {
    ...actual,
    getMarkdownFilesSorted: vi.fn().mockReturnValue([]),
    trashSafe: vi.fn().mockResolvedValue(undefined)
  };
});

vi.mock('obsidian-dev-utils/obsidian/loop', async (importOriginal) => {
  const actual = await importOriginal<typeof import('obsidian-dev-utils/obsidian/loop')>();
  return {
    ...actual,
    loop: vi.fn().mockResolvedValue(undefined)
  };
});

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { getBasesContextConstructor } from '@obsidian-typings/obsidian-public-latest/implementations';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { loop } from 'obsidian-dev-utils/obsidian/loop';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { getCacheSafe } from 'obsidian-dev-utils/obsidian/metadata-cache';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import {
  getMarkdownFilesSorted,
  trashSafe
} from 'obsidian-dev-utils/obsidian/vault';

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { FrontmatterMarkdownLinksComponent } from './frontmatter-markdown-links-component.ts';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { LinkFixer as LinkFixerCls } from './link-fixer.ts';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { PatchedInputElementMap as PatchedInputElementMapCls } from './patched-input-element-map.ts';

interface ComponentAppAccess {
  app: App;
}

interface CreateComponentOptions {
  readonly app?: App;
  readonly shouldShowInitializationNotice?: boolean;
}

function createComponent(options: CreateComponentOptions = {}): FrontmatterMarkdownLinksComponent {
  const app = options.app ?? createMockApp();
  const abortSignalComponent = castTo<AbortSignalComponent>(new AbortSignalComponentCls('frontmatter-markdown-links'));
  const editorExtensionRegistrar = strictProxy<EditorExtensionRegistrar>({ registerEditorExtension: vi.fn() });
  const linkFixer = castTo<LinkFixer>(new LinkFixerCls());
  const patchedInputElementMap = castTo<PatchedInputElementMap>(new PatchedInputElementMapCls());
  const settings = new PluginSettings();
  if (options.shouldShowInitializationNotice !== undefined) {
    settings.shouldShowInitializationNotice = options.shouldShowInitializationNotice;
  }
  const pluginSettingsComponent = castTo<PluginSettingsComponent>({ settings });

  return new FrontmatterMarkdownLinksComponent({
    abortSignalComponent,
    app,
    editorExtensionRegistrar,
    linkFixer,
    patchedInputElementMap,
    pluginNoticeComponent: createMockPluginNoticeComponent(),
    pluginSettingsComponent
  });
}

function createMockApp(): App {
  const resolvedLinks: Record<string, Record<string, number>> = {};
  const unresolvedLinks: Record<string, Record<string, number>> = {};
  return castTo<App>({
    internalPlugins: {
      getEnabledPluginById: vi.fn().mockReturnValue(null)
    },
    metadataCache: {
      getCache: vi.fn().mockReturnValue(null),
      getFileByPath: vi.fn().mockReturnValue(null),
      getFirstLinkpathDest: vi.fn().mockReturnValue(null),
      on: vi.fn().mockReturnValue({}),
      resolvedLinks,
      trigger: vi.fn(),
      unresolvedLinks
    },
    vault: {
      getFileByPath: vi.fn().mockReturnValue(null),
      getMarkdownFiles: vi.fn().mockReturnValue([]),
      on: vi.fn().mockReturnValue({}),
      read: vi.fn().mockResolvedValue('')
    },
    workspace: {
      activeEditor: null,
      getActiveFile: vi.fn().mockReturnValue(null),
      getActiveViewOfType: vi.fn().mockReturnValue(null),
      getLeavesOfType: vi.fn().mockReturnValue([]),
      on: vi.fn().mockReturnValue({})
    }
  });
}

function createMockPluginNoticeComponent(): PluginNoticeComponent {
  return strictProxy<PluginNoticeComponent>({
    showNotice: castTo<PluginNoticeComponent['showNotice']>(vi.fn(() => strictProxy<NoticeOriginal>({ hide: vi.fn(), setMessage: vi.fn() })))
  });
}

function getApp(component: FrontmatterMarkdownLinksComponent): App {
  return castTo<ComponentAppAccess>(component).app;
}

function makeTFile(path: string): TFile {
  const app = AppCls.createConfigured__();
  return castTo<TFile>(TFileCls.create__(app.vault, path));
}

function setApp(component: FrontmatterMarkdownLinksComponent, app: App): void {
  castTo<ComponentAppAccess>(component).app = app;
}

afterEach(() => {
  vi.clearAllMocks();
  mockCacheConstructor.mockImplementation(createMockCacheInstance);
  vi.mocked(getCacheSafe).mockReset().mockResolvedValue(null);
  vi.mocked(getMarkdownFilesSorted).mockReset().mockReturnValue([]);
  vi.mocked(trashSafe).mockReset().mockResolvedValue(undefined);
  vi.mocked(loop).mockReset().mockResolvedValue(undefined);
});

beforeEach(() => {
  vi.mocked(getBasesContextConstructor).mockReturnValue(castTo<ReturnType<typeof getBasesContextConstructor>>(MockBasesContext));
});

describe('FrontmatterMarkdownLinksComponent', () => {
  describe('onload lifecycle', () => {
    interface LifecycleApp {
      readonly app: App;
      readonly metadataCacheOn: ReturnType<typeof vi.fn>;
      readonly registerEditorExtension: EditorExtensionRegistrar['registerEditorExtension'];
      readonly synchronize: ReturnType<typeof vi.fn>;
    }

    function createLifecycleApp(): LifecycleApp {
      const metadataCacheOn = vi.fn().mockReturnValue({});
      const registerEditorExtension = vi.fn<EditorExtensionRegistrar['registerEditorExtension']>();
      const synchronize = vi.fn();

      const markdownLeafView = Object.create(MarkdownView.prototype) as object;
      Object.assign(markdownLeafView, {
        metadataEditor: { synchronize },
        rawFrontmatter: 'title: Hello'
      });
      const markdownLeaf = castTo<WorkspaceLeaf>({ view: markdownLeafView });

      const app = castTo<App>({
        internalPlugins: {
          getEnabledPluginById: vi.fn().mockReturnValue(null)
        },
        metadataCache: {
          getCache: vi.fn().mockReturnValue(null),
          on: metadataCacheOn,
          resolvedLinks: {},
          trigger: vi.fn(),
          unresolvedLinks: {}
        },
        metadataTypeManager: {
          registeredTypeWidgets: {
            multitext: {},
            text: {}
          }
        },
        vault: {
          getFileByPath: vi.fn().mockReturnValue(null),
          getMarkdownFiles: vi.fn().mockReturnValue([]),
          on: vi.fn().mockReturnValue({}),
          read: vi.fn().mockResolvedValue('')
        },
        workspace: {
          activeEditor: null,
          getActiveFile: vi.fn().mockReturnValue(null),
          getActiveViewOfType: vi.fn().mockReturnValue(null),
          getLeavesOfType: vi.fn((viewType: string) => {
            if (viewType === 'markdown') {
              return [markdownLeaf];
            }
            return [];
          }),
          iterateAllLeaves: vi.fn(),
          on: vi.fn().mockReturnValue({}),
          onLayoutReady: vi.fn((cb: () => void) => {
            cb();
          })
        }
      });

      return { app, metadataCacheOn, registerEditorExtension, synchronize };
    }

    function createLifecycleComponent(app: App, registrar: EditorExtensionRegistrar): FrontmatterMarkdownLinksComponent {
      const abortSignalComponent = castTo<AbortSignalComponent>(new AbortSignalComponentCls('frontmatter-markdown-links'));
      const linkFixer = castTo<LinkFixer>(new LinkFixerCls());
      const patchedInputElementMap = castTo<PatchedInputElementMap>(new PatchedInputElementMapCls());
      const pluginSettingsComponent = castTo<PluginSettingsComponent>({ settings: new PluginSettings() });

      return new FrontmatterMarkdownLinksComponent({
        abortSignalComponent,
        app,
        editorExtensionRegistrar: registrar,
        linkFixer,
        patchedInputElementMap,
        pluginNoticeComponent: createMockPluginNoticeComponent(),
        pluginSettingsComponent
      });
    }

    it('should register the editor extension and refresh markdown views on load', () => {
      const { app, registerEditorExtension, synchronize } = createLifecycleApp();
      const registrar = strictProxy<EditorExtensionRegistrar>({ registerEditorExtension });
      const component = createLifecycleComponent(app, registrar);

      component.load();

      expect(registerEditorExtension).toHaveBeenCalled();
      // `refreshMarkdownViews` synchronizes the metadata editor twice for each markdown leaf.
      expect(synchronize).toHaveBeenCalledTimes(2);
      component.unload();
    });

    it('should clear the metadata cache and refresh views when unloaded', async () => {
      const { app, registerEditorExtension, synchronize } = createLifecycleApp();
      const registrar = strictProxy<EditorExtensionRegistrar>({ registerEditorExtension });
      const component = createLifecycleComponent(app, registrar);
      // Spy before `load()`: the unload cleanup binds `clearMetadataCache` at load time.
      // The spy must therefore be in place before load for the registered cleanup to pick it up.
      const clearSpy = vi.spyOn(castTo<ClearMetadataCacheAccess>(component), 'clearMetadataCache')
        .mockResolvedValue(undefined);
      component.load();
      synchronize.mockClear();

      component.unload();

      // The unload-time cleanup fires `clearMetadataCache` fire-and-forget via the real `convertAsyncToSync`.
      await waitForAllAsyncOperations();
      expect(clearSpy).toHaveBeenCalled();
      // The registered cleanup runs `refreshMarkdownViews` again on unload.
      expect(synchronize).toHaveBeenCalled();
    });

    it('should run onLayoutReady through the real load path and register cache listeners', async () => {
      vi.useFakeTimers();
      try {
        const { app, metadataCacheOn, registerEditorExtension } = createLifecycleApp();
        const registrar = strictProxy<EditorExtensionRegistrar>({ registerEditorExtension });
        const component = createLifecycleComponent(app, registrar);

        component.load();
        // `LayoutReadyComponent.onload` schedules the protected `onLayoutReady` via `window.setTimeout(0)`.
        await vi.runAllTimersAsync();

        // `onLayoutReady` registers a metadataCache 'changed' listener.
        expect(metadataCacheOn).toHaveBeenCalledWith('changed', expect.any(Function));
        expect(vi.mocked(loop)).toHaveBeenCalled();
        component.unload();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should route metadataCache changed events through the handleMetadataCacheChanged adapter', async () => {
      vi.useFakeTimers();
      try {
        const { app, metadataCacheOn, registerEditorExtension } = createLifecycleApp();
        const registrar = strictProxy<EditorExtensionRegistrar>({ registerEditorExtension });
        const component = createLifecycleComponent(app, registrar);
        const handleSpy = vi.spyOn(castTo<HandleMetadataCacheChangedAccess>(component), 'handleMetadataCacheChanged')
          .mockResolvedValue(undefined);

        component.load();
        // `LayoutReadyComponent.onload` schedules the protected `onLayoutReady` via `window.setTimeout(0)`.
        await vi.runAllTimersAsync();

        // `onLayoutReady` registers exactly one metadataCache listener (the 'changed' adapter).
        const changedHandler = castTo<(file: TFile, data: string, cache: CachedMetadata) => void>(metadataCacheOn.mock.calls[0]?.[1]);
        const tfile = makeTFile('changed.md');
        const cache = castTo<CachedMetadata>({});

        // The adapter arrow unpacks the positional 'changed' event args into the params-object call.
        changedHandler(tfile, 'content', cache);

        expect(handleSpy).toHaveBeenCalledWith({ cache, data: 'content', file: tfile });
        component.unload();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should patch the bases note during onLayoutReady', async () => {
      vi.useFakeTimers();
      try {
        const { app, registerEditorExtension } = createLifecycleApp();
        const augmented = castTo<LifecycleAugmentApp>(app);
        augmented.vault.getMarkdownFiles = vi.fn().mockReturnValue([makeTFile('existing.md')]);
        const registrar = strictProxy<EditorExtensionRegistrar>({ registerEditorExtension });
        const component = createLifecycleComponent(app, registrar);

        component.load();
        await vi.runAllTimersAsync();
        await waitForAllAsyncOperations();

        expect(vi.mocked(getBasesContextConstructor)).toHaveBeenCalledWith(app);
        component.unload();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('handleDelete', () => {
    it('should delete the file path from the frontmatter cache', () => {
      const component = createComponent();
      const mockCache = castTo<MockCacheInstanceAccess>(component['frontmatterMarkdownLinksCache']);
      const file = strictProxy<TAbstractFile>({ path: 'some/file.md' });

      component['handleDelete'](file);

      expect(mockCache.delete).toHaveBeenCalledWith('some/file.md');
    });
  });

  describe('handleRename', () => {
    it('should call rename on the cache when the file is a TFile', () => {
      const component = createComponent();
      const mockCache = castTo<CacheRenameAccess & ValidCacheInstance>(component['frontmatterMarkdownLinksCache']);
      const file = makeTFile('new.md');

      component['handleRename'](file, 'old.md');

      expect(mockCache.rename).toHaveBeenCalledWith('old.md', file);
    });

    it('should not call rename when the file is not a TFile', () => {
      const component = createComponent();
      const mockCache = castTo<CacheRenameAccess>(component['frontmatterMarkdownLinksCache']);
      const file = strictProxy<TAbstractFile>({ path: 'some/folder' });

      component['handleRename'](file, 'other/folder');

      expect(mockCache.rename).not.toHaveBeenCalled();
    });
  });

  describe('handleFileOpen', () => {
    it('should not patch the editor when activeEditor is null', () => {
      const component = createComponent();

      component['handleFileOpen']();

      expect(component['isEditorPatched']).toBe(false);
    });

    it('should not patch the editor when activeEditor has no editor', () => {
      const component = createComponent();
      setApp(
        component,
        castTo<App>({
          workspace: {
            activeEditor: { editor: undefined }
          }
        })
      );

      component['handleFileOpen']();

      expect(component['isEditorPatched']).toBe(false);
    });

    it('should patch the editor when activeEditor has an editor', () => {
      const component = createComponent();
      const editorInstance = castTo<Editor>({});
      setApp(
        component,
        castTo<App>({
          workspace: {
            activeEditor: { editor: editorInstance }
          }
        })
      );

      component['handleFileOpen']();

      expect(component['isEditorPatched']).toBe(true);
    });

    it('should not re-patch when already patched', () => {
      const component = createComponent();
      component['isEditorPatched'] = true;
      const editorInstance = castTo<Editor>({});
      setApp(
        component,
        castTo<App>({
          workspace: {
            activeEditor: { editor: editorInstance }
          }
        })
      );
      const addChildSpy = vi.spyOn(component, 'addChild');

      component['handleFileOpen']();

      expect(addChildSpy).not.toHaveBeenCalled();
    });
  });

  describe('handleMetadataCacheChanged', () => {
    it('should process frontmatter links in the changed file asynchronously', async () => {
      const component = createComponent();
      const tfile = makeTFile('file.md');
      const cache = strictProxy<CachedMetadata>({ frontmatter: castTo<FrontMatterCache>({}) });
      const processSpy = vi.spyOn(castTo<ProcessFrontmatterLinksInFileAccess>(component), 'processFrontmatterLinksInFile')
        .mockResolvedValue(undefined);

      await component['handleMetadataCacheChanged']({ cache, data: 'content', file: tfile });

      // The handler fires `processFrontmatterLinksInFile` fire-and-forget via the real `invokeAsyncSafely`.
      await waitForAllAsyncOperations();
      expect(processSpy).toHaveBeenCalledWith({ cache, data: 'content', file: tfile });
    });
  });

  describe('processFrontmatterLinks', () => {
    it('should return false for a null value', () => {
      const component = createComponent();
      const cache: CachedMetadata = {};

      const result = component['processFrontmatterLinks']({ cache, filePath: 'file.md', key: 'key', value: null });

      expect(result).toBe(false);
    });

    it('should return false for a number value', () => {
      const component = createComponent();
      const cache: CachedMetadata = {};

      const result = component['processFrontmatterLinks']({ cache, filePath: 'file.md', key: 'key', value: 42 });

      expect(result).toBe(false);
    });

    it('should return false for a plain string with no links', () => {
      const component = createComponent();
      const cache: CachedMetadata = {};

      const result = component['processFrontmatterLinks']({ cache, filePath: 'file.md', key: 'key', value: 'plain text' });

      expect(result).toBe(false);
    });

    it('should return false for an external-only link string', () => {
      const component = createComponent();
      const cache: CachedMetadata = {};

      const result = component['processFrontmatterLinks']({ cache, filePath: 'file.md', key: 'key', value: 'https://example.com' });

      expect(result).toBe(false);
    });

    it('should return true and populate frontmatterLinks for an internal markdown link', () => {
      const component = createComponent();
      const cache: CachedMetadata = {};

      const result = component['processFrontmatterLinks']({ cache, filePath: 'file.md', key: 'key', value: '[note](target.md)' });

      expect(result).toBe(true);
      expect(cache.frontmatterLinks?.length).toBeGreaterThan(0);
    });

    it('should process a nested object recursively', () => {
      const component = createComponent();
      const cache: CachedMetadata = {};

      const result = component['processFrontmatterLinks']({ cache, filePath: 'file.md', key: 'key', value: { nested: '[note](target.md)' } });

      expect(result).toBe(true);
    });

    it('should return false for an empty object', () => {
      const component = createComponent();
      const cache: CachedMetadata = {};

      const result = component['processFrontmatterLinks']({ cache, filePath: 'file.md', key: '', value: {} });

      expect(result).toBe(false);
    });

    it('should return false for a single wikilink value', () => {
      const component = createComponent();
      const cache: CachedMetadata = {};

      const result = component['processFrontmatterLinks']({ cache, filePath: 'file.md', key: 'key', value: '[[some/note]]' });

      expect(result).toBe(false);
    });

    it('should populate displayText from the alias', () => {
      const component = createComponent();
      const cache: CachedMetadata = {};

      component['processFrontmatterLinks']({ cache, filePath: 'file.md', key: 'key', value: '[My Note](target.md)' });

      expect(cache.frontmatterLinks?.[0]?.displayText).toBe('My Note');
    });

    it('should populate displayText from the url when there is no alias', () => {
      const component = createComponent();
      const cache: CachedMetadata = {};

      component['processFrontmatterLinks']({ cache, filePath: 'file.md', key: 'key', value: '[](target.md)' });

      expect(cache.frontmatterLinks?.[0]?.displayText).toBe('target.md');
    });

    it('should drop existing frontmatter links for the same key before reprocessing', () => {
      const component = createComponent();
      const cache: CachedMetadata = {
        frontmatterLinks: [
          { displayText: 'old', key: 'key', link: 'old-target', original: 'old' },
          { displayText: 'other', key: 'other', link: 'other-target', original: 'other' }
        ]
      };

      component['processFrontmatterLinks']({ cache, filePath: 'file.md', key: 'key', value: '[note](target.md)' });

      const keyLinks = (cache.frontmatterLinks ?? []).filter((link) => link.key === 'key');
      expect(keyLinks).toHaveLength(1);
      expect(keyLinks[0]?.link).toBe('target.md');
      expect((cache.frontmatterLinks ?? []).map((link) => link.key)).toContain('other');
    });

    it('should create offset-based links for multi-link values', () => {
      const component = createComponent();
      const cache: CachedMetadata = {};

      component['processFrontmatterLinks']({ cache, filePath: 'file.md', key: 'key', value: 'text [a](x.md) and [b](y.md)' });

      const offsetLink = (cache.frontmatterLinks ?? []).find((link) => 'startOffset' in link);
      expect(offsetLink).toBeDefined();
    });
  });

  describe('processFrontmatterLinksInFile', () => {
    it('should skip when already processing the same file', async () => {
      const component = createComponent();
      const tfile = makeTFile('file.md');
      const cache: CachedMetadata = { frontmatter: castTo<FrontMatterCache>({ key: '[note](target.md)' }) };
      component['currentlyProcessingFiles'].add('file.md');

      await component['processFrontmatterLinksInFile']({ cache, file: tfile });

      expect(getApp(component).metadataCache.trigger).not.toHaveBeenCalled();
    });

    it('should skip when the frontmatter has no links', async () => {
      const component = createComponent();
      const tfile = makeTFile('file.md');
      const cache: CachedMetadata = { frontmatter: castTo<FrontMatterCache>({ key: 'plain text' }) };

      await component['processFrontmatterLinksInFile']({ cache, file: tfile });

      expect(getApp(component).metadataCache.trigger).not.toHaveBeenCalled();
    });

    it('should trigger a metadataCache change when the frontmatter has links', async () => {
      const component = createComponent();
      const tfile = makeTFile('file.md');
      const cache: CachedMetadata = { frontmatter: castTo<FrontMatterCache>({ key: '[note](target.md)' }) };

      await component['processFrontmatterLinksInFile']({ cache, data: 'content', file: tfile });

      expect(getApp(component).metadataCache.trigger).toHaveBeenCalledWith('changed', tfile, 'content', cache);
    });

    it('should read the file content when data is not provided', async () => {
      const component = createComponent();
      const tfile = makeTFile('file.md');
      const cache: CachedMetadata = { frontmatter: castTo<FrontMatterCache>({ key: '[note](target.md)' }) };
      vi.mocked(getApp(component).vault.read).mockResolvedValue('file content');

      await component['processFrontmatterLinksInFile']({ cache, file: tfile });

      expect(getApp(component).vault.read).toHaveBeenCalledWith(tfile);
    });

    it('should clear the processing state after completion', async () => {
      const component = createComponent();
      const tfile = makeTFile('file.md');
      const cache: CachedMetadata = { frontmatter: castTo<FrontMatterCache>({ key: '[note](target.md)' }) };

      await component['processFrontmatterLinksInFile']({ cache, data: 'content', file: tfile });

      expect(component['currentlyProcessingFiles'].has('file.md')).toBe(false);
    });
  });

  describe('refreshMarkdownViews', () => {
    function createMarkdownLeaf(rawFrontmatter: string, synchronize: () => void): WorkspaceLeaf {
      const view = Object.create(MarkdownView.prototype) as object;
      Object.assign(view, {
        metadataEditor: { synchronize },
        rawFrontmatter
      });
      return castTo<WorkspaceLeaf>({ view });
    }

    it('should complete without error when there are no markdown leaves', () => {
      const component = createComponent();
      vi.mocked(getApp(component).workspace.getLeavesOfType).mockReturnValue([]);

      expect(() => {
        component['refreshMarkdownViews']();
      }).not.toThrow();
    });

    it('should skip leaves whose view is not a MarkdownView', () => {
      const component = createComponent();
      const synchronize = vi.fn();
      const nonMarkdownLeaf = castTo<WorkspaceLeaf>({ view: castTo<WorkspaceLeaf['view']>({}) });
      vi.mocked(getApp(component).workspace.getLeavesOfType).mockReturnValue([nonMarkdownLeaf]);

      component['refreshMarkdownViews']();

      expect(synchronize).not.toHaveBeenCalled();
    });

    it('should synchronize the metadata editor for markdown leaves', () => {
      const component = createComponent();
      const synchronize = vi.fn();
      const leaf = createMarkdownLeaf('title: Hello', synchronize);
      vi.mocked(getApp(component).workspace.getLeavesOfType).mockReturnValue([leaf]);

      component['refreshMarkdownViews']();

      expect(synchronize).toHaveBeenCalledTimes(2);
      expect(synchronize).toHaveBeenLastCalledWith({ title: 'Hello' });
    });
  });

  describe('handleMouseDown', () => {
    function createLinkTarget(linkData: LinkDataShape): HTMLElement {
      const target = createDiv();
      target.setAttribute('data-frontmatter-markdown-links-link-data', JSON.stringify(linkData));
      activeDocument.body.appendChild(target);
      return target;
    }

    it('should do nothing for a right-button click', () => {
      const component = createComponent();
      const RIGHT_BUTTON = 2;
      const evt = castTo<MouseEvent>({
        button: RIGHT_BUTTON,
        preventDefault: vi.fn(),
        stopImmediatePropagation: vi.fn()
      });

      component['handleMouseDown'](evt);

      expect(evt.preventDefault).not.toHaveBeenCalled();
    });

    it('should do nothing when the target has no link data', () => {
      const component = createComponent();
      const target = createDiv();
      const evt = castTo<MouseEvent>({
        button: 0,
        preventDefault: vi.fn(),
        stopImmediatePropagation: vi.fn(),
        target
      });

      component['handleMouseDown'](evt);

      expect(evt.preventDefault).not.toHaveBeenCalled();
    });

    it('should do nothing when the event has no target', () => {
      const component = createComponent();
      setApp(
        component,
        strictProxy<App>({
          workspace: {
            getActiveViewOfType: vi.fn().mockReturnValue(null)
          }
        })
      );
      const evt = castTo<MouseEvent>({ button: 0, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn(), target: null });

      component['handleMouseDown'](evt);

      expect(evt.preventDefault).not.toHaveBeenCalled();
    });

    it('should do nothing in source mode without a mod key', () => {
      const component = createComponent();
      setApp(
        component,
        strictProxy<App>({
          workspace: {
            getActiveViewOfType: vi.fn().mockReturnValue(strictProxy<MarkdownView>({
              getMode: vi.fn().mockReturnValue('source'),
              getState: vi.fn().mockReturnValue({ source: true })
            }))
          }
        })
      );
      const target = createLinkTarget({ isExternalUrl: false, isWikilink: false, url: 'note.md' });
      const evt = castTo<MouseEvent>({ button: 0, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn(), target });

      component['handleMouseDown'](evt);

      expect(evt.preventDefault).not.toHaveBeenCalled();
      target.remove();
    });

    it('should open an external URL in a new tab on middle-click', () => {
      const component = createComponent();
      setApp(
        component,
        strictProxy<App>({
          workspace: {
            getActiveViewOfType: vi.fn().mockReturnValue(null)
          }
        })
      );
      const openSpy = vi.spyOn(activeWindow, 'open').mockReturnValue(null);
      const target = createLinkTarget({ isExternalUrl: true, isWikilink: false, url: 'https://example.com' });
      const evt = castTo<MouseEvent>({ button: 1, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn(), target });

      component['handleMouseDown'](evt);

      expect(openSpy).toHaveBeenCalledWith('https://example.com', 'tab');
      // The capturing click handler blocks the follow-up click.
      const clickEvt = new MouseEvent('click', { bubbles: true, cancelable: true });
      const clickPreventSpy = vi.spyOn(clickEvt, 'preventDefault');
      target.dispatchEvent(clickEvt);
      expect(clickPreventSpy).toHaveBeenCalled();
      openSpy.mockRestore();
      target.remove();
    });

    it('should block the follow-up auxclick after a middle-click so the note does not open twice', () => {
      const component = createComponent();
      const openLinkText = vi.fn().mockResolvedValue(undefined);
      setApp(
        component,
        strictProxy<App>({
          workspace: {
            getActiveFile: vi.fn().mockReturnValue(makeTFile('current.md')),
            getActiveViewOfType: vi.fn().mockReturnValue(null),
            openLinkText
          }
        })
      );
      const MIDDLE_BUTTON = 1;
      const target = createLinkTarget({ isExternalUrl: false, isWikilink: false, url: 'note.md' });
      const evt = castTo<MouseEvent>({ button: MIDDLE_BUTTON, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn(), target });

      component['handleMouseDown'](evt);

      // Browsers fire `auxclick` (not `click`) for the middle button. Obsidian's native handler opens
      // The link on this event, so the plugin must swallow it to avoid opening the note a second time.
      const auxclickEvt = new MouseEvent('auxclick', { bubbles: true, button: MIDDLE_BUTTON, cancelable: true });
      const auxclickPreventSpy = vi.spyOn(auxclickEvt, 'preventDefault');
      const auxclickStopSpy = vi.spyOn(auxclickEvt, 'stopImmediatePropagation');
      target.dispatchEvent(auxclickEvt);

      expect(auxclickPreventSpy).toHaveBeenCalled();
      expect(auxclickStopSpy).toHaveBeenCalled();
      target.remove();
    });

    it('should open an external URL in the same tab on left-click', () => {
      const component = createComponent();
      setApp(
        component,
        strictProxy<App>({
          workspace: {
            getActiveViewOfType: vi.fn().mockReturnValue(null)
          }
        })
      );
      const openSpy = vi.spyOn(activeWindow, 'open').mockReturnValue(null);
      const target = createLinkTarget({ isExternalUrl: true, isWikilink: false, url: 'https://example.com' });
      const evt = castTo<MouseEvent>({ button: 0, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn(), target });

      component['handleMouseDown'](evt);

      expect(openSpy).toHaveBeenCalledWith('https://example.com', '');
      openSpy.mockRestore();
      target.remove();
    });

    it('should do nothing for an internal link when there is no active file', () => {
      const component = createComponent();
      const getActiveFile = vi.fn().mockReturnValue(null);
      setApp(
        component,
        strictProxy<App>({
          workspace: {
            getActiveFile,
            getActiveViewOfType: vi.fn().mockReturnValue(null)
          }
        })
      );
      const target = createLinkTarget({ isExternalUrl: false, isWikilink: false, url: 'note.md' });
      const evt = castTo<MouseEvent>({ button: 0, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn(), target });

      component['handleMouseDown'](evt);

      expect(evt.preventDefault).toHaveBeenCalled();
      expect(getActiveFile).toHaveBeenCalled();
      target.remove();
    });

    it('should open the link text for an internal link with an active file', async () => {
      const component = createComponent();
      const openLinkText = vi.fn().mockResolvedValue(undefined);
      setApp(
        component,
        strictProxy<App>({
          workspace: {
            getActiveFile: vi.fn().mockReturnValue(makeTFile('current.md')),
            getActiveViewOfType: vi.fn().mockReturnValue(null),
            openLinkText
          }
        })
      );
      const target = createLinkTarget({ isExternalUrl: false, isWikilink: false, url: 'note.md' });
      const evt = castTo<MouseEvent>({ button: 0, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn(), target });

      component['handleMouseDown'](evt);
      // The handler opens the link fire-and-forget via the real `invokeAsyncSafely`.
      await waitForAllAsyncOperations();

      expect(openLinkText).toHaveBeenCalledWith('note.md', 'current.md', false);
      target.remove();
    });
  });

  describe('handleMouseOver', () => {
    it('should do nothing when the target has no link data', () => {
      const component = createComponent();
      const target = createDiv();
      const evt = castTo<MouseEvent>({
        preventDefault: vi.fn(),
        target
      });

      component['handleMouseOver'](evt);

      expect(evt.preventDefault).not.toHaveBeenCalled();
    });

    it('should not trigger hover for external URL links', () => {
      const component = createComponent();
      const trigger = vi.fn();
      setApp(
        component,
        strictProxy<App>({
          workspace: {
            getActiveViewOfType: vi.fn().mockReturnValue(null),
            trigger
          }
        })
      );
      const target = createDiv();
      target.setAttribute(
        'data-frontmatter-markdown-links-link-data',
        JSON.stringify({ isExternalUrl: true, isWikilink: false, url: 'https://example.com' })
      );
      activeDocument.body.appendChild(target);
      const evt = castTo<MouseEvent>({ preventDefault: vi.fn(), target });

      component['handleMouseOver'](evt);

      expect(evt.preventDefault).not.toHaveBeenCalled();
      expect(trigger).not.toHaveBeenCalled();
      target.remove();
    });

    it('should trigger a hover-link event for internal links', () => {
      const component = createComponent();
      const trigger = vi.fn();
      setApp(
        component,
        strictProxy<App>({
          workspace: {
            getActiveViewOfType: vi.fn().mockReturnValue(null),
            trigger
          }
        })
      );
      const target = createDiv();
      target.setAttribute(
        'data-frontmatter-markdown-links-link-data',
        JSON.stringify({ isExternalUrl: false, isWikilink: false, url: 'target/note.md' })
      );
      activeDocument.body.appendChild(target);
      const evt = castTo<MouseEvent>({ preventDefault: vi.fn(), target });

      component['handleMouseOver'](evt);

      expect(evt.preventDefault).toHaveBeenCalled();
      expect(trigger).toHaveBeenCalledWith('hover-link', expect.objectContaining({ linktext: 'target/note.md', source: 'source' }));
      target.remove();
    });

    it('should use the markdown view hover source when triggering hover-link', () => {
      const component = createComponent();
      const trigger = vi.fn();
      const markdownView = castTo<MarkdownView>({
        getHoverSource: vi.fn().mockReturnValue('preview')
      });
      setApp(
        component,
        strictProxy<App>({
          workspace: {
            getActiveViewOfType: vi.fn().mockReturnValue(markdownView),
            trigger
          }
        })
      );
      const target = createDiv();
      target.setAttribute(
        'data-frontmatter-markdown-links-link-data',
        JSON.stringify({ isExternalUrl: false, isWikilink: false, url: 'note.md' })
      );
      activeDocument.body.appendChild(target);
      const evt = castTo<MouseEvent>({ preventDefault: vi.fn(), target });

      component['handleMouseOver'](evt);

      expect(trigger).toHaveBeenCalledWith('hover-link', expect.objectContaining({ source: 'preview' }));
      target.remove();
    });
  });

  describe('clearMetadataCache', () => {
    it('should skip a file whose cache has no frontmatterLinks', async () => {
      const component = createComponent();
      vi.mocked(castTo<MockCacheInstanceAccess>(component['frontmatterMarkdownLinksCache']).getFilePaths).mockReturnValue(['file.md']);
      vi.mocked(getApp(component).metadataCache.getCache).mockReturnValue({});

      await component['clearMetadataCache']();

      expect(getApp(component).metadataCache.trigger).not.toHaveBeenCalled();
    });

    it('should skip triggering a change when the vault file is not found', async () => {
      const component = createComponent();
      const mockCache = castTo<CacheGetKeysAccess & MockCacheInstanceAccess>(component['frontmatterMarkdownLinksCache']);
      mockCache.getFilePaths.mockReturnValue(['missing.md']);
      mockCache.getKeys.mockReturnValue(['key1']);
      vi.mocked(getApp(component).metadataCache.getCache).mockReturnValue({
        frontmatterLinks: [{ displayText: 'link', key: 'key1', link: 'target', original: 'orig' }]
      });
      vi.mocked(getApp(component).vault.getFileByPath).mockReturnValue(null);

      await component['clearMetadataCache']();

      expect(getApp(component).metadataCache.trigger).not.toHaveBeenCalled();
    });

    it('should trigger a cache change for a file with frontmatter links and a valid vault file', async () => {
      const component = createComponent();
      const tfile = makeTFile('file.md');
      const mockCache = castTo<CacheGetKeysAccess & MockCacheInstanceAccess>(component['frontmatterMarkdownLinksCache']);
      mockCache.getFilePaths.mockReturnValue(['file.md']);
      mockCache.getKeys.mockReturnValue(['key1']);
      vi.mocked(getApp(component).metadataCache.getCache).mockReturnValue({
        frontmatterLinks: [{ displayText: 'link', key: 'key1', link: 'target', original: 'orig' }]
      });
      vi.mocked(getApp(component).vault.getFileByPath).mockReturnValue(tfile);
      vi.mocked(getApp(component).vault.read).mockResolvedValue('file content');

      await component['clearMetadataCache']();

      expect(getApp(component).metadataCache.trigger).toHaveBeenCalledWith('changed', tfile, 'file content', expect.any(Object));
    });

    it('should keep remaining frontmatter links when not all keys match', async () => {
      const component = createComponent();
      const tfile = makeTFile('file.md');
      const mockCache = castTo<CacheGetKeysAccess & MockCacheInstanceAccess>(component['frontmatterMarkdownLinksCache']);
      mockCache.getFilePaths.mockReturnValue(['file.md']);
      mockCache.getKeys.mockReturnValue(['key1']);
      const remainingLink = { displayText: 'keep', key: 'key2', link: 'keep-target', original: 'keep' };
      const cacheToClear: CachedMetadata = {
        frontmatterLinks: [
          { displayText: 'drop', key: 'key1', link: 'target', original: 'orig' },
          remainingLink
        ]
      };
      vi.mocked(getApp(component).metadataCache.getCache).mockReturnValue(cacheToClear);
      vi.mocked(getApp(component).vault.getFileByPath).mockReturnValue(tfile);
      vi.mocked(getApp(component).vault.read).mockResolvedValue('content');

      await component['clearMetadataCache']();

      expect(cacheToClear.frontmatterLinks).toEqual([remainingLink]);
    });
  });

  describe('updateResolvedOrUnresolvedLinksCache', () => {
    it('should increment the resolved link count for a known file', () => {
      const component = createComponent();
      const tfile = makeTFile('target.md');
      vi.mocked(getApp(component).metadataCache.getFirstLinkpathDest).mockReturnValue(tfile);

      component['updateResolvedOrUnresolvedLinksCache']({ link: 'target.md', notePath: 'note.md' });

      expect(getApp(component).metadataCache.resolvedLinks['note.md']?.['target.md']).toBe(1);
    });

    it('should increment the unresolved link count for an unknown file', () => {
      const component = createComponent();
      vi.mocked(getApp(component).metadataCache.getFirstLinkpathDest).mockReturnValue(null);

      component['updateResolvedOrUnresolvedLinksCache']({ link: 'unknown.md', notePath: 'note.md' });

      expect(getApp(component).metadataCache.unresolvedLinks['note.md']?.['unknown.md']).toBe(1);
    });

    it('should accumulate counts for multiple calls to the same note', () => {
      const component = createComponent();
      vi.mocked(getApp(component).metadataCache.getFirstLinkpathDest).mockReturnValue(null);

      component['updateResolvedOrUnresolvedLinksCache']({ link: 'link1.md', notePath: 'note.md' });
      component['updateResolvedOrUnresolvedLinksCache']({ link: 'link1.md', notePath: 'note.md' });

      expect(getApp(component).metadataCache.unresolvedLinks['note.md']?.['link1.md']).toBe(2);
    });
  });

  describe('processAllNotes', () => {
    it('should reinitialize the cache and call loop', async () => {
      const component = createComponent();

      await component['processAllNotes']();

      expect(vi.mocked(castTo<CacheInitAccess>(component['frontmatterMarkdownLinksCache']).init)).toHaveBeenCalledWith(getApp(component));
      expect(vi.mocked(loop)).toHaveBeenCalled();
    });

    it('should delete cached file paths that are no longer in the vault', async () => {
      vi.mocked(loop).mockImplementation(async () => {
        await noopAsync();
      });
      const component = createComponent();
      const nextInstance = castTo<MockCacheInstanceAccess>(createMockCacheInstance());
      nextInstance.getFilePaths.mockReturnValue(['old-file.md']);
      mockCacheConstructor.mockImplementationOnce(function mockNextCacheInstance(this: Record<string, unknown>) {
        Object.assign(this, nextInstance);
        return this;
      });

      await component['processAllNotes']();

      expect(nextInstance.delete).toHaveBeenCalledWith('old-file.md');
    });

    it('should pass shouldShowInitializationNotice from settings to loop', async () => {
      const component = createComponent({ shouldShowInitializationNotice: false });

      await component['processAllNotes']();

      const loopParams = vi.mocked(loop).mock.calls[0]?.[0];
      expect(loopParams?.shouldShowProgressBar).toBe(false);
    });

    it('should pass a buildNoticeMessage that formats the note path', async () => {
      const component = createComponent();

      await component['processAllNotes']();

      const loopParams = vi.mocked(loop).mock.calls[0]?.[0];
      const note = makeTFile('some/note.md');
      const message = loopParams?.buildNoticeMessage(note, '1/10');
      expect(message).toContain('some/note.md');
    });

    it('should iterate the markdown files returned by getMarkdownFilesSorted', async () => {
      const component = createComponent();
      vi.mocked(getMarkdownFilesSorted).mockReturnValue([makeTFile('a.md')]);

      await component['processAllNotes']();

      const loopParams = vi.mocked(loop).mock.calls.at(-1)?.[0];
      expect(loopParams?.items).toHaveLength(1);
    });
  });

  describe('processAllNotes processItem', () => {
    type ProcessItemFn = (note: TFile) => Promise<void>;

    interface CaptureProcessItemResult {
      readonly cacheInstance: MockCacheInstanceAccess & ValidCacheInstance;
      readonly processItem: ProcessItemFn;
    }

    async function captureProcessItem(component: FrontmatterMarkdownLinksComponent): Promise<CaptureProcessItemResult> {
      const nextInstance = castTo<CaptureProcessItemResult['cacheInstance']>(createMockCacheInstance());
      mockCacheConstructor.mockImplementationOnce(function mockNextCacheInstance(this: Record<string, unknown>) {
        Object.assign(this, nextInstance);
        return this;
      });
      await component['processAllNotes']();
      const loopParams = vi.mocked(loop).mock.calls.at(-1)?.[0];
      return {
        cacheInstance: nextInstance,
        processItem: castTo<ProcessItemFn>(loopParams?.processItem)
      };
    }

    it('should process invalid-cache notes via processFrontmatterLinksInFile', async () => {
      const component = createComponent();
      const note = makeTFile('note.md');
      const processSpy = vi.spyOn(castTo<ProcessFrontmatterLinksInFileAccess>(component), 'processFrontmatterLinksInFile')
        .mockResolvedValue(undefined);
      vi.mocked(getCacheSafe).mockResolvedValue({});
      const { processItem } = await captureProcessItem(component);

      await processItem(note);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any(...) is an asymmetric matcher typed `any`.
      expect(processSpy).toHaveBeenCalledWith({ cache: expect.any(Object), file: note });
    });

    it('should return early for invalid-cache notes when no cache is available', async () => {
      const component = createComponent();
      const note = makeTFile('note.md');
      const processSpy = vi.spyOn(castTo<ProcessFrontmatterLinksInFileAccess>(component), 'processFrontmatterLinksInFile')
        .mockResolvedValue(undefined);
      vi.mocked(getCacheSafe).mockResolvedValue(null);
      const { processItem } = await captureProcessItem(component);

      await processItem(note);

      expect(processSpy).not.toHaveBeenCalled();
    });

    it('should return early for valid-cache notes with no cached links', async () => {
      const component = createComponent();
      const note = makeTFile('note.md');
      const { cacheInstance, processItem } = await captureProcessItem(component);
      cacheInstance.isCacheValid.mockReturnValue(true);
      cacheInstance.getLinks.mockReturnValue([]);
      vi.mocked(getCacheSafe).mockClear();

      await processItem(note);

      expect(vi.mocked(getCacheSafe)).not.toHaveBeenCalled();
    });

    it('should return early for valid-cache notes when getCacheSafe returns null', async () => {
      const component = createComponent();
      const note = makeTFile('note.md');
      const { cacheInstance, processItem } = await captureProcessItem(component);
      cacheInstance.isCacheValid.mockReturnValue(true);
      cacheInstance.getLinks.mockReturnValue([{ displayText: 'd', key: 'key', link: 'target.md', original: 'orig' }]);
      vi.mocked(getCacheSafe).mockResolvedValue(null);
      const updateSpy = vi.spyOn(castTo<UpdateResolvedOrUnresolvedLinksCacheAccess>(component), 'updateResolvedOrUnresolvedLinksCache');

      await processItem(note);

      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('should restore obsidian links and delete keys whose value changed', async () => {
      const component = createComponent();
      const note = makeTFile('note.md');
      const { cacheInstance, processItem } = await captureProcessItem(component);
      cacheInstance.isCacheValid.mockReturnValue(true);
      cacheInstance.getLinks.mockReturnValue([{ displayText: 'd', key: 'key', link: 'target.md', original: 'expected-original' }]);
      const obsidianLink = { displayText: 'obs', key: 'key', link: 'obs-target.md', original: 'obs' };
      vi.mocked(getCacheSafe).mockResolvedValue({
        frontmatter: castTo<FrontMatterCache>({ key: 'different-value' }),
        frontmatterLinks: [obsidianLink]
      });

      await processItem(note);

      expect(cacheInstance.deleteKey).toHaveBeenCalledWith({ filePath: 'note.md', key: 'key' });
    });

    it('should keep matching links and update the resolved-links cache', async () => {
      const component = createComponent();
      const note = makeTFile('note.md');
      const { cacheInstance, processItem } = await captureProcessItem(component);
      cacheInstance.isCacheValid.mockReturnValue(true);
      cacheInstance.getLinks.mockReturnValue([{ displayText: 'd', key: 'key', link: 'target.md', original: 'expected-original' }]);
      vi.mocked(getCacheSafe).mockResolvedValue({
        frontmatter: castTo<FrontMatterCache>({ key: 'expected-original' }),
        frontmatterLinks: []
      });
      const updateSpy = vi.spyOn(castTo<UpdateResolvedOrUnresolvedLinksCacheAccess>(component), 'updateResolvedOrUnresolvedLinksCache');

      await processItem(note);

      expect(updateSpy).toHaveBeenCalledWith({ link: 'target.md', notePath: 'note.md' });
    });

    it('should not restore an obsidian link when none exists for a changed key', async () => {
      const component = createComponent();
      const note = makeTFile('note.md');
      const { cacheInstance, processItem } = await captureProcessItem(component);
      cacheInstance.isCacheValid.mockReturnValue(true);
      cacheInstance.getLinks.mockReturnValue([{ displayText: 'd', key: 'key', link: 'target.md', original: 'expected-original' }]);
      vi.mocked(getCacheSafe).mockResolvedValue({
        frontmatter: castTo<FrontMatterCache>({ key: 'changed-value' }),
        frontmatterLinks: []
      });

      await processItem(note);

      expect(cacheInstance.deleteKey).toHaveBeenCalledWith({ filePath: 'note.md', key: 'key' });
    });

    it('should default to an empty frontmatter object when the cache has none', async () => {
      const component = createComponent();
      const note = makeTFile('note.md');
      const { cacheInstance, processItem } = await captureProcessItem(component);
      cacheInstance.isCacheValid.mockReturnValue(true);
      cacheInstance.getLinks.mockReturnValue([{ displayText: 'd', key: 'key', link: 'target.md', original: 'orig' }]);
      vi.mocked(getCacheSafe).mockResolvedValue({ frontmatterLinks: [] });

      await processItem(note);

      expect(cacheInstance.deleteKey).toHaveBeenCalledWith({ filePath: 'note.md', key: 'key' });
    });
  });

  describe('patchBasesNote', () => {
    it('should patch the note using an existing markdown file', async () => {
      const component = createComponent();
      const existingFile = makeTFile('existing.md');
      setApp(
        component,
        castTo<App>({
          vault: castTo<App['vault']>({
            getMarkdownFiles: vi.fn().mockReturnValue([existingFile])
          })
        })
      );

      await component['patchBasesNote']();

      expect(vi.mocked(getBasesContextConstructor)).toHaveBeenCalledWith(getApp(component));
      expect(vi.mocked(trashSafe)).not.toHaveBeenCalled();
    });

    it('should create and trash a temporary markdown file when none exist', async () => {
      const component = createComponent();
      const tempFile = makeTFile('__TEMP__.md');
      const create = vi.fn().mockResolvedValue(tempFile);
      setApp(
        component,
        castTo<App>({
          vault: castTo<App['vault']>({
            create,
            getMarkdownFiles: vi.fn().mockReturnValue([])
          })
        })
      );

      await component['patchBasesNote']();

      expect(create).toHaveBeenCalled();
      expect(vi.mocked(trashSafe)).toHaveBeenCalledWith(getApp(component), tempFile);
    });
  });
});

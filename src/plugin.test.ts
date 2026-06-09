import type { ClickableToken } from '@obsidian-typings/obsidian-public-latest';
import type {
  App,
  CachedMetadata,
  Editor,
  EditorPosition,
  FrontMatterCache,
  Menu,
  PluginManifest,
  TAbstractFile,
  TFile,
  WorkspaceLeaf
} from 'obsidian';

import { ViewType } from '@obsidian-typings/obsidian-public-latest/implementations';
import { invokeAsyncSafely } from 'obsidian-dev-utils/async';
import { noopAsync } from 'obsidian-dev-utils/function';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { CallbackLayoutReadyComponent } from 'obsidian-dev-utils/obsidian/components/layout-ready-component';
import { MonkeyAroundComponent } from 'obsidian-dev-utils/obsidian/components/monkey-around-component';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  App as AppCls,
  MarkdownView,
  Menu as MenuCls,
  MenuItem,
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

import { registerFrontmatterLinksEditorExtension } from './frontmatter-links-editor-extension.ts';
import { patchMultiTextPropertyWidgetComponent } from './multi-text-property-widget-component.ts';
import { PluginSettings } from './plugin-settings.ts';
import { patchTextPropertyWidgetComponent } from './text-property-widget-component.ts';

type AnyFn = (...args: never[]) => unknown;

interface BasesExternalLinkRenderToAccess {
  basesExternalLinkRenderTo: AnyFn;
}

interface BasesListRenderToAccess {
  basesListRenderTo: AnyFn;
}

interface BasesLocal {
  note: BasesNoteLike;
}

interface BasesNoteLike {
  data: Record<string, unknown>;
}

interface GetClickableTokenAtAccess {
  getClickableTokenAt: AnyFn;
}

interface GetPatchFactory {
  get?: PatchFactory;
}

interface LinkDataShape {
  isExternalUrl: boolean;
  isWikilink: boolean;
  url: string;
}

interface MenuItemSectionAccess {
  section: string;
}

interface MockCacheInstanceAccess {
  delete: ReturnType<typeof vi.fn>;
  getFilePaths: ReturnType<typeof vi.fn>;
}

interface NoteGetAccess {
  noteGet: AnyFn;
}

interface OnLayoutReadyAccess {
  onLayoutReady(): void;
}

type PatchFactory = (next: AnyFn) => AnyFn;

interface ProcessFrontmatterLinksInFileAccess {
  processFrontmatterLinksInFile: AnyFn;
}

interface RefreshMarkdownViewsAccess {
  refreshMarkdownViews(): void;
}

interface RegisterEventAccess {
  registerEvent: AnyFn;
}

interface RenderToPatchFactory {
  renderTo?: PatchFactory;
}

interface ShowAtMouseEventAccess {
  showAtMouseEvent: AnyFn;
}

interface ShowAtMouseEventPatchFactory {
  showAtMouseEvent?: PatchFactory;
}

interface UpdateResolvedOrUnresolvedLinksCacheAccess {
  updateResolvedOrUnresolvedLinksCache: AnyFn;
}

interface ValidCacheInstance {
  deleteKey: ReturnType<typeof vi.fn>;
  getLinks: ReturnType<typeof vi.fn>;
  isCacheValid: ReturnType<typeof vi.fn>;
}

class MockBasesContext {
  public _local: BasesLocal;
  public constructor() {
    this._local = { note: { data: {} } };
  }
}

vi.mock('obsidian-dev-utils/obsidian/plugin/plugin', () => {
  class PluginBase {
    public app: App;
    public manifest: PluginManifest;
    public registerEvent: (_ref: unknown) => void = vi.fn();
    protected abortSignalComponent = {
      abortSignal: new AbortController().signal
    };

    public constructor(app: App, manifest: PluginManifest) {
      this.app = app;
      this.manifest = manifest;
    }

    public addChild<T>(child: T): T {
      return child;
    }

    public async onload(): Promise<void> {
      await noopAsync();
    }

    public register(_fn: () => void): void {
      // Base mock does not track registrations.
    }
  }
  return { PluginBase };
});

vi.mock('obsidian-dev-utils/obsidian/data-handler', () => ({
  PluginDataHandler: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/plugin/plugin-event-source', () => ({
  // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- mock class needed for constructor.
  PluginEventSourceImpl: class MockPluginEventSourceImpl {}
}));

vi.mock('./plugin-settings-component.ts', () => {
  class PluginSettingsComponent {
    public settings = new PluginSettings();
  }
  return { PluginSettingsComponent };
});

vi.mock('./plugin-settings-tab.ts', () => ({
  PluginSettingsTab: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/components/plugin-settings-tab-component', () => ({
  PluginSettingsTabComponent: vi.fn()
}));

vi.mock('obsidian-dev-utils/obsidian/components/layout-ready-component', () => ({
  CallbackLayoutReadyComponent: vi.fn()
}));

const mockRegisterPatch = vi.fn();
vi.mock('obsidian-dev-utils/obsidian/components/monkey-around-component', () => {
  class MockMonkeyAroundComponent {
    public registerPatch: AnyFn = mockRegisterPatch;
  }
  return { MonkeyAroundComponent: MockMonkeyAroundComponent };
});

const mockRegisterAllDocumentsDomEvent = vi.fn();
vi.mock('obsidian-dev-utils/obsidian/components/all-windows-event-component', () => {
  class AllWindowsEventComponent {
    public registerAllDocumentsDomEvent: AnyFn = mockRegisterAllDocumentsDomEvent;
  }
  return { AllWindowsEventComponent };
});

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

vi.mock('./frontmatter-links-editor-extension.ts', () => ({
  registerFrontmatterLinksEditorExtension: vi.fn()
}));

vi.mock('./text-property-widget-component.ts', () => ({
  patchTextPropertyWidgetComponent: vi.fn()
}));

vi.mock('./multi-text-property-widget-component.ts', () => ({
  patchMultiTextPropertyWidgetComponent: vi.fn()
}));

interface RenameDeleteHandlerParams {
  settingsBuilder(): RenameDeleteHandlerSettingsResult;
}

interface RenameDeleteHandlerSettingsResult {
  readonly shouldHandleRenames?: boolean;
}

const capturedRenameDeleteHandlerSettingsBuilders: (() => RenameDeleteHandlerSettingsResult)[] = [];

vi.mock('obsidian-dev-utils/obsidian/components/rename-delete-handler-component', () => ({
  // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Mock component class that only needs to capture constructor params.
  RenameDeleteHandlerComponent: class {
    public constructor(params: RenameDeleteHandlerParams) {
      capturedRenameDeleteHandlerSettingsBuilders.push(params.settingsBuilder);
    }
  }
}));

vi.mock('obsidian-dev-utils/obsidian/metadata-cache', () => ({
  getCacheSafe: vi.fn().mockResolvedValue(null)
}));

vi.mock('obsidian-dev-utils/obsidian/vault', () => ({
  getMarkdownFilesSorted: vi.fn().mockReturnValue([]),
  trashSafe: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('obsidian-dev-utils/obsidian/loop', () => ({
  loop: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('obsidian-dev-utils/async', async (importOriginal) => {
  const actual = await importOriginal<typeof import('obsidian-dev-utils/async')>();
  return {
    ...actual,
    convertAsyncToSync: vi.fn().mockImplementation((fn: AnyFn) => fn),
    invokeAsyncSafely: vi.fn(),
    requestAnimationFrameAsync: vi.fn().mockResolvedValue(undefined)
  };
});

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
import { Plugin } from './plugin.ts';

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

function createPlugin(): Plugin {
  return new Plugin(createMockApp(), strictProxy<PluginManifest>({ id: 'frontmatter-markdown-links' }));
}

function makeTFile(path: string): TFile {
  const app = AppCls.createConfigured__();
  return castTo<TFile>(TFileCls.create__(app.vault, path));
}

afterEach(() => {
  vi.clearAllMocks();
  // Restore default cache constructor implementation after each test.
  mockCacheConstructor.mockImplementation(createMockCacheInstance);
  // ClearAllMocks resets call history but keeps implementations, so reset the ones
  // That individual tests override to avoid leaking behavior into later tests.
  vi.mocked(invokeAsyncSafely).mockReset();
  vi.mocked(getCacheSafe).mockReset().mockResolvedValue(null);
  vi.mocked(getMarkdownFilesSorted).mockReset().mockReturnValue([]);
  capturedRenameDeleteHandlerSettingsBuilders.length = 0;
});

describe('Plugin', () => {
  describe('constructor', () => {
    it('should create plugin with a settings component', () => {
      const plugin = createPlugin();

      expect(plugin['pluginSettingsComponent']).toBeDefined();
    });

    it('should pass a callback to CallbackLayoutReadyComponent', () => {
      createPlugin();

      expect(vi.mocked(CallbackLayoutReadyComponent)).toHaveBeenCalled();
    });

    it('should instantiate a MonkeyAroundComponent child for monkey patching', () => {
      const plugin = createPlugin();

      expect(plugin['monkeyAroundComponent']).toBeInstanceOf(MonkeyAroundComponent);
    });
  });

  describe('onload', () => {
    it('should call patchTextPropertyWidgetComponent', async () => {
      const plugin = createPlugin();
      await plugin.onload();

      expect(vi.mocked(patchTextPropertyWidgetComponent)).toHaveBeenCalledWith(plugin);
    });

    it('should call patchMultiTextPropertyWidgetComponent', async () => {
      const plugin = createPlugin();
      await plugin.onload();

      expect(vi.mocked(patchMultiTextPropertyWidgetComponent)).toHaveBeenCalledWith(plugin);
    });

    it('should register frontmatter links editor extension', async () => {
      const plugin = createPlugin();
      await plugin.onload();

      expect(vi.mocked(registerFrontmatterLinksEditorExtension)).toHaveBeenCalledWith(plugin);
    });

    it('should call refreshMarkdownViews on load', async () => {
      const plugin = createPlugin();
      const spy = vi.spyOn(castTo<RefreshMarkdownViewsAccess>(plugin), 'refreshMarkdownViews');
      await plugin.onload();

      expect(spy).toHaveBeenCalled();
    });
  });

  describe('onLayoutReady', () => {
    let plugin: Plugin;

    beforeEach(() => {
      plugin = createPlugin();
    });

    it('should register rename/delete handlers', () => {
      plugin['onLayoutReady']();

      expect(capturedRenameDeleteHandlerSettingsBuilders.length).toBe(1);
    });

    it('should pass shouldHandleRenames from settings to rename handler builder', () => {
      plugin['onLayoutReady']();

      const settingsBuilder = capturedRenameDeleteHandlerSettingsBuilders[0];
      const settings = settingsBuilder?.();

      expect(settings?.shouldHandleRenames).toBe(true);
    });

    it('should invoke processAllNotes asynchronously', () => {
      plugin['onLayoutReady']();

      expect(vi.mocked(invokeAsyncSafely)).toHaveBeenCalled();
    });

    it('should patch Menu.prototype.showAtMouseEvent', () => {
      plugin['onLayoutReady']();

      const patchCalls = mockRegisterPatch.mock.calls;
      const showAtMouseEventCall = patchCalls.find((call) => Boolean(call[1]) && 'showAtMouseEvent' in castTo<object>(call[1]));
      expect(showAtMouseEventCall).toBeDefined();
    });

    it('should register mousedown and mouseover listeners on all windows', () => {
      plugin['onLayoutReady']();

      expect(mockRegisterAllDocumentsDomEvent).toHaveBeenCalledWith('mousedown', expect.any(Function), expect.any(Object));
      expect(mockRegisterAllDocumentsDomEvent).toHaveBeenCalledWith('mouseover', expect.any(Function), expect.any(Object));
    });
  });

  describe('handleDelete', () => {
    it('should delete file path from frontmatter cache', () => {
      const plugin = createPlugin();
      const mockCache = plugin['frontmatterMarkdownLinksCache'];
      const file: TAbstractFile = strictProxy<TAbstractFile>({ path: 'some/file.md' });

      plugin['handleDelete'](file);

      expect(vi.mocked(mockCache.delete)).toHaveBeenCalledWith('some/file.md');
    });
  });

  describe('handleRename', () => {
    it('should call rename on cache when file is TFile', () => {
      const plugin = createPlugin();
      const mockCache = plugin['frontmatterMarkdownLinksCache'];
      const file = makeTFile('new.md');

      plugin['handleRename'](file, 'old.md');

      expect(vi.mocked(mockCache.rename)).toHaveBeenCalledWith('old.md', file);
    });

    it('should not call rename when file is not a TFile', () => {
      const plugin = createPlugin();
      const mockCache = plugin['frontmatterMarkdownLinksCache'];
      const file: TAbstractFile = strictProxy<TAbstractFile>({ path: 'some/folder' });

      plugin['handleRename'](file, 'other/folder');

      expect(vi.mocked(mockCache.rename)).not.toHaveBeenCalled();
    });
  });

  describe('handleFileOpen', () => {
    it('should not patch editor when activeEditor is null', () => {
      const plugin = createPlugin();

      plugin['handleFileOpen']();

      expect(plugin['isEditorPatched']).toBe(false);
    });

    it('should not patch editor when activeEditor has no editor property', () => {
      const plugin = createPlugin();
      // Using a plain object (not strictProxy) since we need undefined property access without throw.
      plugin.app = castTo<App>({
        workspace: {
          activeEditor: { editor: undefined }
        }
      });

      plugin['handleFileOpen']();

      expect(plugin['isEditorPatched']).toBe(false);
    });

    it('should patch editor when activeEditor has an editor', () => {
      const plugin = createPlugin();
      const mockEditorProto = {};
      // Use plain object to allow nested property access.
      plugin.app = castTo<App>({
        workspace: {
          activeEditor: {
            editor: {
              constructor: {
                prototype: mockEditorProto
              }
            }
          }
        }
      });
      mockRegisterPatch.mockClear();

      plugin['handleFileOpen']();

      expect(plugin['isEditorPatched']).toBe(true);
      const patchCalls = mockRegisterPatch.mock.calls;
      const tokenPatchCall = patchCalls.find((call) => call[0] === mockEditorProto);
      expect(tokenPatchCall).toBeDefined();
    });

    it('should not re-patch when already patched', () => {
      const plugin = createPlugin();
      plugin['isEditorPatched'] = true;
      mockRegisterPatch.mockClear();

      plugin['handleFileOpen']();

      const patchCalls = mockRegisterPatch.mock.calls;
      const tokenPatchCall = patchCalls.find((call) => Boolean(call[1]) && 'getClickableTokenAt' in castTo<object>(call[1]));
      expect(tokenPatchCall).toBeUndefined();
    });
  });

  describe('handleMetadataCacheChanged', () => {
    it('should invoke processFrontmatterLinksInFile asynchronously', () => {
      const plugin = createPlugin();
      const tfile = makeTFile('file.md');
      const cache = strictProxy<CachedMetadata>({ frontmatter: {} });

      plugin['handleMetadataCacheChanged'](tfile, 'content', cache);

      expect(vi.mocked(invokeAsyncSafely)).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('patchLink', () => {
    it('should return non-string values unchanged', () => {
      const plugin = createPlugin();

      expect(plugin['patchLink'](42)).toBe(42);
      expect(plugin['patchLink'](null)).toBeNull();
      expect(plugin['patchLink'](undefined)).toBeUndefined();
    });

    it('should return plain string unchanged when not a link', () => {
      const plugin = createPlugin();

      expect(plugin['patchLink']('plain text')).toBe('plain text');
    });

    it('should return wikilink unchanged', () => {
      const plugin = createPlugin();

      expect(plugin['patchLink']('[[some/note]]')).toBe('[[some/note]]');
    });

    it('should convert internal markdown link with alias to wikilink', () => {
      const plugin = createPlugin();

      expect(plugin['patchLink']('[alias](some/note.md)')).toBe('[[some/note.md|alias]]');
    });

    it('should convert internal markdown link without alias to wikilink without pipe', () => {
      const plugin = createPlugin();

      expect(plugin['patchLink']('[](some/note.md)')).toBe('[[some/note.md]]');
    });

    it('should return external url without alias unchanged', () => {
      const plugin = createPlugin();

      expect(plugin['patchLink']('https://example.com')).toBe('https://example.com');
    });

    it('should register external link with alias and return placeholder URL', () => {
      const plugin = createPlugin();

      const result = plugin['patchLink']('[Example](https://example.com)') as string;

      expect(result).toMatch(/^https:\/\/EXTERNAL_LINK_PREFIX\.com\/\d+$/);
      expect(plugin['externalLinks'].size).toBe(1);
    });

    it('should map array values recursively', () => {
      const plugin = createPlugin();

      const result = plugin['patchLink'](['plain', '[[wiki]]', 'https://test.com']);

      expect(result).toEqual(['plain', '[[wiki]]', 'https://test.com']);
    });

    it('should assign sequential IDs to multiple external links with aliases', () => {
      const plugin = createPlugin();

      const result1 = plugin['patchLink']('[Link1](https://example1.com)') as string;
      const result2 = plugin['patchLink']('[Link2](https://example2.com)') as string;

      expect(result1).toMatch(/1$/);
      expect(result2).toMatch(/2$/);
      expect(plugin['externalLinks'].size).toBe(2);
    });
  });

  describe('processFrontmatterLinks', () => {
    it('should return false for null value', () => {
      const plugin = createPlugin();
      const cache: CachedMetadata = {};

      const result = plugin['processFrontmatterLinks'](null, 'key', cache, 'file.md');

      expect(result).toBe(false);
    });

    it('should return false for number value', () => {
      const plugin = createPlugin();
      const cache: CachedMetadata = {};

      const result = plugin['processFrontmatterLinks'](42, 'key', cache, 'file.md');

      expect(result).toBe(false);
    });

    it('should return false for plain string with no links', () => {
      const plugin = createPlugin();
      const cache: CachedMetadata = {};

      const result = plugin['processFrontmatterLinks']('plain text', 'key', cache, 'file.md');

      expect(result).toBe(false);
    });

    it('should return false for external-only link string', () => {
      const plugin = createPlugin();
      const cache: CachedMetadata = {};

      const result = plugin['processFrontmatterLinks']('https://example.com', 'key', cache, 'file.md');

      expect(result).toBe(false);
    });

    it('should return true and populate frontmatterLinks for internal markdown link', () => {
      const plugin = createPlugin();
      const mockApp = createMockApp();
      plugin.app = mockApp;
      const cache: CachedMetadata = {};

      const result = plugin['processFrontmatterLinks']('[note](target.md)', 'key', cache, 'file.md');

      expect(result).toBe(true);
      expect(cache.frontmatterLinks).toBeDefined();
      expect(cache.frontmatterLinks?.length).toBeGreaterThan(0);
    });

    it('should process nested object frontmatter recursively', () => {
      const plugin = createPlugin();
      const mockApp = createMockApp();
      plugin.app = mockApp;
      const cache: CachedMetadata = {};

      const result = plugin['processFrontmatterLinks']({ nested: '[note](target.md)' }, 'key', cache, 'file.md');

      expect(result).toBe(true);
    });

    it('should return false for single wikilink value', () => {
      const plugin = createPlugin();
      const cache: CachedMetadata = {};

      const result = plugin['processFrontmatterLinks']('[[some/note]]', 'key', cache, 'file.md');

      expect(result).toBe(false);
    });

    it('should return false for empty object', () => {
      const plugin = createPlugin();
      const cache: CachedMetadata = {};

      const result = plugin['processFrontmatterLinks']({}, 'key', cache, 'file.md');

      expect(result).toBe(false);
    });

    it('should populate link with displayText from alias', () => {
      const plugin = createPlugin();
      const mockApp = createMockApp();
      plugin.app = mockApp;
      const cache: CachedMetadata = {};

      plugin['processFrontmatterLinks']('[My Note](target.md)', 'key', cache, 'file.md');

      expect(cache.frontmatterLinks?.[0]?.displayText).toBe('My Note');
    });

    it('should populate link with url as displayText when no alias', () => {
      const plugin = createPlugin();
      const mockApp = createMockApp();
      plugin.app = mockApp;
      const cache: CachedMetadata = {};

      plugin['processFrontmatterLinks']('[](target.md)', 'key', cache, 'file.md');

      expect(cache.frontmatterLinks?.[0]?.displayText).toBe('target.md');
    });
  });

  describe('processFrontmatterLinksInFile', () => {
    it('should skip when already processing the same file', async () => {
      const plugin = createPlugin();
      const tfile = makeTFile('file.md');
      const cache: CachedMetadata = { frontmatter: castTo<FrontMatterCache>({ key: '[note](target.md)' }) };
      plugin['currentlyProcessingFiles'].add('file.md');

      await plugin['processFrontmatterLinksInFile'](tfile, cache);

      expect(plugin.app.metadataCache.trigger).not.toHaveBeenCalled();
    });

    it('should skip when frontmatter has no links', async () => {
      const plugin = createPlugin();
      const tfile = makeTFile('file.md');
      const cache: CachedMetadata = { frontmatter: castTo<FrontMatterCache>({ key: 'plain text' }) };

      await plugin['processFrontmatterLinksInFile'](tfile, cache);

      expect(plugin.app.metadataCache.trigger).not.toHaveBeenCalled();
    });

    it('should trigger metadataCache changed when frontmatter has links', async () => {
      const plugin = createPlugin();
      const tfile = makeTFile('file.md');
      const cache: CachedMetadata = { frontmatter: castTo<FrontMatterCache>({ key: '[note](target.md)' }) };

      await plugin['processFrontmatterLinksInFile'](tfile, cache, 'content');

      expect(plugin.app.metadataCache.trigger).toHaveBeenCalledWith('changed', tfile, 'content', cache);
    });

    it('should read file content when data is not provided', async () => {
      const plugin = createPlugin();
      const tfile = makeTFile('file.md');
      const cache: CachedMetadata = { frontmatter: castTo<FrontMatterCache>({ key: '[note](target.md)' }) };
      vi.mocked(plugin.app.vault.read).mockResolvedValue('file content');

      await plugin['processFrontmatterLinksInFile'](tfile, cache);

      expect(plugin.app.vault.read).toHaveBeenCalledWith(tfile);
    });

    it('should clear processing state after completion', async () => {
      const plugin = createPlugin();
      const tfile = makeTFile('file.md');
      const cache: CachedMetadata = { frontmatter: castTo<FrontMatterCache>({ key: '[note](target.md)' }) };

      await plugin['processFrontmatterLinksInFile'](tfile, cache, 'content');

      expect(plugin['currentlyProcessingFiles'].has('file.md')).toBe(false);
    });
  });

  describe('refreshMarkdownViews', () => {
    it('should complete without error when no markdown leaves exist', () => {
      const plugin = createPlugin();
      vi.mocked(plugin.app.workspace.getLeavesOfType).mockReturnValue([]);

      expect(() => {
        plugin['refreshMarkdownViews']();
      }).not.toThrow();
    });
  });

  describe('showAtMouseEvent', () => {
    it('should call fallback next when target is null', () => {
      const plugin = createPlugin();
      const menu = castTo<Menu>(MenuCls.create2__());
      menu.items = [];
      const next = vi.fn().mockReturnValue(menu);
      const evt = castTo<MouseEvent>({ target: null });

      const result = plugin['showAtMouseEvent'](next, menu, evt);

      expect(next).toHaveBeenCalledWith(evt);
      expect(result).toBe(menu);
    });

    it('should call fallback when target has no link data', () => {
      const plugin = createPlugin();
      const menu = castTo<Menu>(MenuCls.create2__());
      menu.items = [];
      const next = vi.fn().mockReturnValue(menu);
      const target = activeDocument.createElement('div');
      const evt = castTo<MouseEvent>({ target });

      const result = plugin['showAtMouseEvent'](next, menu, evt);

      expect(next).toHaveBeenCalledWith(evt);
      expect(result).toBe(menu);
    });
  });

  describe('handleMouseDown', () => {
    it('should do nothing for right-button click', () => {
      const plugin = createPlugin();
      const RIGHT_BUTTON = 2;
      const evt = castTo<MouseEvent>({
        button: RIGHT_BUTTON,
        preventDefault: vi.fn(),
        stopImmediatePropagation: vi.fn()
      });

      plugin['handleMouseDown'](evt);

      expect(evt.preventDefault).not.toHaveBeenCalled();
    });

    it('should do nothing when target has no link data', () => {
      const plugin = createPlugin();
      const target = activeDocument.createElement('div');
      const evt = castTo<MouseEvent>({
        button: 0,
        preventDefault: vi.fn(),
        stopImmediatePropagation: vi.fn(),
        target
      });

      plugin['handleMouseDown'](evt);

      expect(evt.preventDefault).not.toHaveBeenCalled();
    });
  });

  describe('handleMouseOver', () => {
    it('should do nothing when target has no link data', () => {
      const plugin = createPlugin();
      const target = activeDocument.createElement('div');
      const evt = castTo<MouseEvent>({
        preventDefault: vi.fn(),
        target
      });

      plugin['handleMouseOver'](evt);

      expect(evt.preventDefault).not.toHaveBeenCalled();
    });

    it('should return without triggering hover for external URL links', () => {
      const plugin = createPlugin();
      const mockTrigger = vi.fn();
      plugin.app = strictProxy<App>({
        workspace: {
          getActiveViewOfType: vi.fn().mockReturnValue(null),
          trigger: mockTrigger
        }
      });
      const target = activeDocument.createElement('div');
      target.setAttribute(
        'data-frontmatter-markdown-links-link-data',
        JSON.stringify({
          isExternalUrl: true,
          isWikilink: false,
          url: 'https://example.com'
        })
      );
      activeDocument.body.appendChild(target);
      const evt = castTo<MouseEvent>({
        preventDefault: vi.fn(),
        target
      });

      plugin['handleMouseOver'](evt);

      expect(evt.preventDefault).not.toHaveBeenCalled();
      expect(mockTrigger).not.toHaveBeenCalled();
      target.remove();
    });

    it('should trigger hover-link event for internal links', () => {
      const plugin = createPlugin();
      const mockTrigger = vi.fn();
      plugin.app = strictProxy<App>({
        workspace: {
          getActiveViewOfType: vi.fn().mockReturnValue(null),
          trigger: mockTrigger
        }
      });
      const target = activeDocument.createElement('div');
      target.setAttribute(
        'data-frontmatter-markdown-links-link-data',
        JSON.stringify({
          isExternalUrl: false,
          isWikilink: false,
          url: 'target/note.md'
        })
      );
      activeDocument.body.appendChild(target);
      const evt = castTo<MouseEvent>({
        preventDefault: vi.fn(),
        target
      });

      plugin['handleMouseOver'](evt);

      expect(evt.preventDefault).toHaveBeenCalled();
      expect(mockTrigger).toHaveBeenCalledWith('hover-link', expect.objectContaining({ linktext: 'target/note.md' }));
      target.remove();
    });
  });

  describe('fixExternalLinks', () => {
    it('should leave anchors alone when href does not match external link prefix', () => {
      const plugin = createPlugin();
      const container = activeDocument.createElement('div');
      const a = activeDocument.createElement('a');
      a.href = 'https://other.com/link';
      container.appendChild(a);

      plugin['fixExternalLinks'](container);

      expect(a.href).toBe('https://other.com/link');
    });

    it('should do nothing when link ID not found in externalLinks map', () => {
      const plugin = createPlugin();
      const container = activeDocument.createElement('div');
      const a = activeDocument.createElement('a');
      a.href = 'https://EXTERNAL_LINK_PREFIX.com/999';
      container.appendChild(a);

      expect(() => {
        plugin['fixExternalLinks'](container);
      }).not.toThrow();
    });

    it('should restore href and text for a known external link', () => {
      const plugin = createPlugin();
      plugin['externalLinkMaxId'] = 1;
      plugin['externalLinks'].set(1, {
        alias: 'Click Here',
        endOffset: 0,
        isEmbed: false,
        isExternal: true,
        isWikilink: false,
        raw: '[Click Here](https://example.com)',
        startOffset: 0,
        url: 'https://example.com'
      });
      const container = activeDocument.createElement('div');
      const a = activeDocument.createElement('a');
      a.href = 'https://EXTERNAL_LINK_PREFIX.com/1';
      container.appendChild(a);

      plugin['fixExternalLinks'](container);

      expect(a.href).toBe('https://example.com/');
    });
  });

  describe('clearMetadataCache', () => {
    it('should skip file when cache has no frontmatterLinks', async () => {
      const plugin = createPlugin();
      vi.mocked(plugin['frontmatterMarkdownLinksCache'].getFilePaths).mockReturnValue(['file.md']);
      vi.mocked(plugin.app.metadataCache.getCache).mockReturnValue({});

      await plugin['clearMetadataCache']();

      expect(plugin.app.metadataCache.trigger).not.toHaveBeenCalled();
    });

    it('should skip triggering change when vault file not found', async () => {
      const plugin = createPlugin();
      vi.mocked(plugin['frontmatterMarkdownLinksCache'].getFilePaths).mockReturnValue(['missing.md']);
      vi.mocked(plugin['frontmatterMarkdownLinksCache'].getKeys).mockReturnValue(['key1']);
      vi.mocked(plugin.app.metadataCache.getCache).mockReturnValue({
        frontmatterLinks: [{ displayText: 'link', key: 'key1', link: 'target', original: 'orig' }]
      });
      vi.mocked(plugin.app.vault.getFileByPath).mockReturnValue(null);

      await plugin['clearMetadataCache']();

      expect(plugin.app.metadataCache.trigger).not.toHaveBeenCalled();
    });

    it('should trigger cache change for file with frontmatter links and valid vault file', async () => {
      const plugin = createPlugin();
      const tfile = makeTFile('file.md');
      vi.mocked(plugin['frontmatterMarkdownLinksCache'].getFilePaths).mockReturnValue(['file.md']);
      vi.mocked(plugin['frontmatterMarkdownLinksCache'].getKeys).mockReturnValue(['key1']);
      vi.mocked(plugin.app.metadataCache.getCache).mockReturnValue({
        frontmatterLinks: [{ displayText: 'link', key: 'key1', link: 'target', original: 'orig' }]
      });
      vi.mocked(plugin.app.vault.getFileByPath).mockReturnValue(tfile);
      vi.mocked(plugin.app.vault.read).mockResolvedValue('file content');

      await plugin['clearMetadataCache']();

      expect(plugin.app.metadataCache.trigger).toHaveBeenCalledWith('changed', tfile, 'file content', expect.any(Object));
    });
  });

  describe('updateResolvedOrUnresolvedLinksCache', () => {
    it('should increment resolved link count for a known file', () => {
      const plugin = createPlugin();
      const tfile = makeTFile('target.md');
      vi.mocked(plugin.app.metadataCache.getFirstLinkpathDest).mockReturnValue(tfile);

      plugin['updateResolvedOrUnresolvedLinksCache']('target.md', 'note.md');

      expect(plugin.app.metadataCache.resolvedLinks['note.md']?.['target.md']).toBe(1);
    });

    it('should increment unresolved link count for an unknown file', () => {
      const plugin = createPlugin();
      vi.mocked(plugin.app.metadataCache.getFirstLinkpathDest).mockReturnValue(null);

      plugin['updateResolvedOrUnresolvedLinksCache']('unknown.md', 'note.md');

      expect(plugin.app.metadataCache.unresolvedLinks['note.md']?.['unknown.md']).toBe(1);
    });

    it('should accumulate counts for multiple calls to same note', () => {
      const plugin = createPlugin();
      vi.mocked(plugin.app.metadataCache.getFirstLinkpathDest).mockReturnValue(null);

      plugin['updateResolvedOrUnresolvedLinksCache']('link1.md', 'note.md');
      plugin['updateResolvedOrUnresolvedLinksCache']('link1.md', 'note.md');

      expect(plugin.app.metadataCache.unresolvedLinks['note.md']?.['link1.md']).toBe(2);
    });
  });

  describe('processAllNotes', () => {
    it('should reinitialize the cache and call loop', async () => {
      const plugin = createPlugin();

      await plugin['processAllNotes']();

      expect(vi.mocked(plugin['frontmatterMarkdownLinksCache'].init)).toHaveBeenCalledWith(plugin.app);
      expect(vi.mocked(loop)).toHaveBeenCalled();
    });

    it('should delete cached file paths that are no longer in the vault', async () => {
      vi.mocked(loop).mockImplementation(async () => {
        // No-op so we can inspect state after the call.
        await noopAsync();
      });
      const plugin = createPlugin();
      // After plugin is created, override the next cache instance (created by processAllNotes).
      const nextInstance = createMockCacheInstance() as MockCacheInstanceAccess;
      nextInstance.getFilePaths.mockReturnValue(['old-file.md']);
      mockCacheConstructor.mockImplementationOnce(function mockNextCacheInstance(this: Record<string, unknown>) {
        Object.assign(this, nextInstance);
        return this;
      });

      await plugin['processAllNotes']();

      expect(nextInstance.delete).toHaveBeenCalledWith('old-file.md');
    });

    it('should pass shouldShowInitializationNotice from settings to loop', async () => {
      const plugin = createPlugin();

      await plugin['processAllNotes']();

      const loopParams = vi.mocked(loop).mock.calls[0]?.[0];
      expect(loopParams?.shouldShowProgressBar).toBe(plugin['pluginSettingsComponent'].settings.shouldShowInitializationNotice);
    });

    it('should pass buildNoticeMessage to loop that formats note path', async () => {
      const plugin = createPlugin();

      await plugin['processAllNotes']();

      const loopParams = vi.mocked(loop).mock.calls[0]?.[0];
      const note = makeTFile('some/note.md');
      const message = loopParams?.buildNoticeMessage(note, '1/10');
      expect(message).toContain('some/note.md');
    });
  });

  describe('basesExternalLinkRenderTo', () => {
    it('should call next and then fix external links in container', () => {
      const plugin = createPlugin();
      const next = vi.fn();
      const containerEl = activeDocument.createElement('div');

      plugin['basesExternalLinkRenderTo'](
        next,
        castTo<Parameters<typeof plugin['basesExternalLinkRenderTo']>[1]>({}),
        containerEl,
        castTo<Parameters<typeof plugin['basesExternalLinkRenderTo']>[3]>({})
      );

      expect(next).toHaveBeenCalled();
    });
  });

  describe('basesListRenderTo', () => {
    it('should call next and then fix external links in container', () => {
      const plugin = createPlugin();
      const next = vi.fn();
      const containerEl = activeDocument.createElement('div');

      plugin['basesListRenderTo'](
        next,
        castTo<Parameters<typeof plugin['basesListRenderTo']>[1]>({}),
        containerEl,
        castTo<Parameters<typeof plugin['basesListRenderTo']>[3]>({})
      );

      expect(next).toHaveBeenCalled();
    });
  });

  describe('constructor callbacks', () => {
    it('should call onLayoutReady when the layout-ready callback runs', async () => {
      const plugin = createPlugin();
      const onLayoutReadySpy = vi.spyOn(castTo<OnLayoutReadyAccess>(plugin), 'onLayoutReady');
      const layoutReadyCallback = vi.mocked(CallbackLayoutReadyComponent).mock.calls.at(-1)?.[1];

      await layoutReadyCallback?.();

      expect(onLayoutReadySpy).toHaveBeenCalled();
    });
  });

  describe('onload register callbacks', () => {
    it('should register a cleanup callback that clears the metadata cache', async () => {
      const plugin = createPlugin();
      const registered: (() => void)[] = [];
      vi.spyOn(plugin, 'register').mockImplementation((fn: () => void) => {
        registered.push(fn);
      });

      await plugin.onload();

      const clearCallback = registered[0];
      clearCallback?.();

      expect(vi.mocked(invokeAsyncSafely)).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('getClickableTokenAt', () => {
    function createEditorMock(node: Node): Editor {
      return strictProxy<Editor>({
        cm: castTo<Editor['cm']>({
          domAtPos: vi.fn().mockReturnValue({ node }),
          posAtDOM: vi.fn().mockReturnValue(0)
        }),
        offsetToPos: vi.fn().mockReturnValue({ ch: 0, line: 0 }),
        posToOffset: vi.fn().mockReturnValue(0)
      });
    }

    function createPos(): EditorPosition {
      return { ch: 0, line: 0 };
    }

    it('should return the token from next when it exists', () => {
      const plugin = createPlugin();
      const token: ClickableToken = { end: createPos(), start: createPos(), text: 'x', type: 'internal-link' };
      const next = vi.fn().mockReturnValue(token);
      const editor = createEditorMock(activeDocument.createElement('div'));

      const result = plugin['getClickableTokenAt'](next, editor, createPos());

      expect(result).toBe(token);
    });

    it('should return null when there is no frontmatter element', () => {
      const plugin = createPlugin();
      const next = vi.fn().mockReturnValue(null);
      const node = activeDocument.createElement('div');
      const editor = createEditorMock(node);

      const result = plugin['getClickableTokenAt'](next, editor, createPos());

      expect(result).toBeNull();
    });

    it('should use parentElement when the node is not an HTMLElement', () => {
      const plugin = createPlugin();
      const next = vi.fn().mockReturnValue(null);
      const parent = activeDocument.createElement('div');
      const textNode = activeDocument.createTextNode('text');
      parent.appendChild(textNode);
      const editor = createEditorMock(textNode);

      const result = plugin['getClickableTokenAt'](next, editor, createPos());

      expect(result).toBeNull();
    });

    it('should return null when no link element is found in the frontmatter', () => {
      const plugin = createPlugin();
      const next = vi.fn().mockReturnValue(null);
      const frontmatterEl = activeDocument.createElement('div');
      frontmatterEl.addClass('cm-hmd-frontmatter');
      // Real Obsidian `find` returns null when nothing matches.
      vi.spyOn(frontmatterEl, 'find').mockReturnValue(castTo<HTMLElement>(null));
      const editor = createEditorMock(frontmatterEl);

      const result = plugin['getClickableTokenAt'](next, editor, createPos());

      expect(result).toBeNull();
    });

    it('should return null when the link element has no link data', () => {
      const plugin = createPlugin();
      const next = vi.fn().mockReturnValue(null);
      const frontmatterEl = activeDocument.createElement('div');
      frontmatterEl.addClass('cm-hmd-frontmatter');
      const linkEl = frontmatterEl.createDiv('cm-hmd-internal-link');
      linkEl.setAttribute('data-frontmatter-markdown-links-link-data', '');
      const editor = createEditorMock(frontmatterEl);

      const result = plugin['getClickableTokenAt'](next, editor, createPos());

      expect(result).toBeNull();
    });

    it('should build an internal-link clickable token using the formatting-link-end element', () => {
      const plugin = createPlugin();
      const next = vi.fn().mockReturnValue(null);
      const frontmatterEl = activeDocument.createElement('div');
      frontmatterEl.addClass('cm-hmd-frontmatter');
      const linkEl = frontmatterEl.createDiv('cm-hmd-internal-link');
      linkEl.setAttribute(
        'data-frontmatter-markdown-links-link-data',
        JSON.stringify({ isExternalUrl: false, isWikilink: false, url: 'note.md' })
      );
      frontmatterEl.createDiv('cm-formatting-link-end');
      const editor = createEditorMock(frontmatterEl);

      const result = plugin['getClickableTokenAt'](next, editor, createPos());

      expect(result?.type).toBe('internal-link');
      expect(result?.text).toBe('note.md');
    });

    it('should build an external-link token and fall back to nextElementSibling when no link-end element exists', () => {
      const plugin = createPlugin();
      const next = vi.fn().mockReturnValue(null);
      const frontmatterEl = activeDocument.createElement('div');
      frontmatterEl.addClass('cm-hmd-frontmatter');
      const linkEl = frontmatterEl.createDiv('cm-url');
      linkEl.setAttribute(
        'data-frontmatter-markdown-links-link-data',
        JSON.stringify({ isExternalUrl: true, isWikilink: false, url: 'https://example.com' })
      );
      const siblingEl = frontmatterEl.createDiv('sibling');
      vi.spyOn(frontmatterEl, 'find').mockImplementation((selector: string) => {
        if (selector === '.cm-formatting-link-end') {
          return castTo<HTMLElement>(null);
        }
        return linkEl;
      });
      const editor = createEditorMock(frontmatterEl);

      const result = plugin['getClickableTokenAt'](next, editor, createPos());

      expect(result?.type).toBe('external-link');
      expect(siblingEl).toBe(linkEl.nextElementSibling);
    });

    it('should keep start as end position when there is no end element', () => {
      const plugin = createPlugin();
      const next = vi.fn().mockReturnValue(null);
      const frontmatterEl = activeDocument.createElement('div');
      frontmatterEl.addClass('cm-hmd-frontmatter');
      const linkEl = frontmatterEl.createDiv('cm-url');
      linkEl.setAttribute(
        'data-frontmatter-markdown-links-link-data',
        JSON.stringify({ isExternalUrl: true, isWikilink: false, url: 'https://example.com' })
      );
      vi.spyOn(frontmatterEl, 'find').mockImplementation((selector: string) => {
        if (selector === '.cm-formatting-link-end') {
          return castTo<HTMLElement>(null);
        }
        return linkEl;
      });
      const editor = createEditorMock(frontmatterEl);

      const result = plugin['getClickableTokenAt'](next, editor, createPos());

      expect(result?.start).toEqual(result?.end);
    });
  });

  describe('handleFileOpen clickable-token patch', () => {
    it('should wire getClickableTokenAt through the plugin when invoked', () => {
      const plugin = createPlugin();
      const editorProto: Record<string, unknown> = {};
      plugin.app = castTo<App>({
        workspace: {
          activeEditor: {
            editor: {
              constructor: { prototype: editorProto }
            }
          }
        }
      });
      let capturedFactory: ((next: AnyFn) => AnyFn) | undefined;
      mockRegisterPatch.mockImplementation((_obj: unknown, factories: Record<string, (next: AnyFn) => AnyFn>) => {
        capturedFactory = factories['getClickableTokenAt'];
      });

      plugin['handleFileOpen']();

      const getClickableTokenAtSpy = vi.spyOn(castTo<GetClickableTokenAtAccess>(plugin), 'getClickableTokenAt').mockReturnValue(null);
      const next = vi.fn().mockReturnValue(null);
      const wrapped = capturedFactory?.(next);
      const editor = castTo<Editor>({});
      castTo<(this: Editor, pos: EditorPosition) => unknown>(wrapped).call(editor, { ch: 0, line: 0 });

      expect(getClickableTokenAtSpy).toHaveBeenCalled();
    });
  });

  describe('handleMetadataCacheChanged async body', () => {
    it('should process frontmatter links in the changed file', async () => {
      const plugin = createPlugin();
      const tfile = makeTFile('file.md');
      const cache = strictProxy<CachedMetadata>({ frontmatter: {} });
      const processSpy = vi.spyOn(castTo<ProcessFrontmatterLinksInFileAccess>(plugin), 'processFrontmatterLinksInFile')
        .mockResolvedValue(undefined);
      const pendingPromises: Promise<unknown>[] = [];
      vi.mocked(invokeAsyncSafely).mockImplementation((fn: () => unknown) => {
        pendingPromises.push(Promise.resolve(fn()));
      });

      plugin['handleMetadataCacheChanged'](tfile, 'content', cache);
      await Promise.all(pendingPromises);

      expect(processSpy).toHaveBeenCalledWith(tfile, cache, 'content');
    });
  });

  describe('handleMouseDown link handling', () => {
    function createLinkTarget(linkData: LinkDataShape): HTMLElement {
      const target = activeDocument.createElement('div');
      target.setAttribute('data-frontmatter-markdown-links-link-data', JSON.stringify(linkData));
      activeDocument.body.appendChild(target);
      return target;
    }

    it('should do nothing in source mode without a mod key', () => {
      const plugin = createPlugin();
      plugin.app = strictProxy<App>({
        workspace: {
          getActiveViewOfType: vi.fn().mockReturnValue(strictProxy<MarkdownView>({
            getMode: vi.fn().mockReturnValue('source'),
            getState: vi.fn().mockReturnValue({ source: true })
          }))
        }
      });
      const target = createLinkTarget({ isExternalUrl: false, isWikilink: false, url: 'note.md' });
      const evt = castTo<MouseEvent>({ button: 0, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn(), target });

      plugin['handleMouseDown'](evt);

      expect(evt.preventDefault).not.toHaveBeenCalled();
      target.remove();
    });

    it('should open an external URL in a new tab on middle-click', () => {
      const plugin = createPlugin();
      plugin.app = strictProxy<App>({
        workspace: {
          getActiveViewOfType: vi.fn().mockReturnValue(null)
        }
      });
      const openSpy = vi.spyOn(activeWindow, 'open').mockReturnValue(null);
      const target = createLinkTarget({ isExternalUrl: true, isWikilink: false, url: 'https://example.com' });
      const evt = castTo<MouseEvent>({ button: 1, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn(), target });

      plugin['handleMouseDown'](evt);

      expect(openSpy).toHaveBeenCalledWith('https://example.com', 'tab');
      // The capturing click handler should block the follow-up click.
      const clickEvt = new MouseEvent('click', { bubbles: true, cancelable: true });
      const clickPreventSpy = vi.spyOn(clickEvt, 'preventDefault');
      target.dispatchEvent(clickEvt);
      expect(clickPreventSpy).toHaveBeenCalled();
      openSpy.mockRestore();
      target.remove();
    });

    it('should do nothing for an internal link when there is no active file', () => {
      const plugin = createPlugin();
      const getActiveFile = vi.fn().mockReturnValue(null);
      plugin.app = strictProxy<App>({
        workspace: {
          getActiveFile,
          getActiveViewOfType: vi.fn().mockReturnValue(null)
        }
      });
      const target = createLinkTarget({ isExternalUrl: false, isWikilink: false, url: 'note.md' });
      const evt = castTo<MouseEvent>({ button: 0, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn(), target });

      plugin['handleMouseDown'](evt);

      expect(evt.preventDefault).toHaveBeenCalled();
      expect(getActiveFile).toHaveBeenCalled();
      target.remove();
    });

    it('should open the link text for an internal link with an active file', async () => {
      const plugin = createPlugin();
      const openLinkText = vi.fn().mockResolvedValue(undefined);
      plugin.app = strictProxy<App>({
        workspace: {
          getActiveFile: vi.fn().mockReturnValue(makeTFile('current.md')),
          getActiveViewOfType: vi.fn().mockReturnValue(null),
          openLinkText
        }
      });
      const pendingPromises: Promise<unknown>[] = [];
      vi.mocked(invokeAsyncSafely).mockImplementation((fn: () => unknown) => {
        pendingPromises.push(Promise.resolve(fn()));
      });
      const target = createLinkTarget({ isExternalUrl: false, isWikilink: false, url: 'note.md' });
      const evt = castTo<MouseEvent>({ button: 0, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn(), target });

      plugin['handleMouseDown'](evt);
      await Promise.all(pendingPromises);

      expect(openLinkText).toHaveBeenCalledWith('note.md', 'current.md', false);
      target.remove();
    });
  });

  describe('showAtMouseEvent link handling', () => {
    function createLinkTarget(linkData: LinkDataShape): HTMLElement {
      const target = activeDocument.createElement('div');
      target.setAttribute('data-frontmatter-markdown-links-link-data', JSON.stringify(linkData));
      activeDocument.body.appendChild(target);
      return target;
    }

    it('should fall back when the menu already has an open-section item', () => {
      const plugin = createPlugin();
      const menu = castTo<Menu>(MenuCls.create2__());
      const openItem = MenuItem.create__(menu);
      castTo<MenuItemSectionAccess>(openItem).section = 'open';
      menu.items = [castTo<Menu['items'][number]>(openItem)];
      const next = vi.fn().mockReturnValue(menu);
      const target = createLinkTarget({ isExternalUrl: false, isWikilink: false, url: 'note.md' });
      const evt = castTo<MouseEvent>({ target });

      const result = plugin['showAtMouseEvent'](next, menu, evt);

      expect(next).toHaveBeenCalledWith(evt);
      expect(result).toBe(menu);
      target.remove();
    });

    it('should add an external link context menu for external links', () => {
      const plugin = createPlugin();
      const handleExternalLinkContextMenu = vi.fn();
      plugin.app = strictProxy<App>({
        workspace: {
          handleExternalLinkContextMenu
        }
      });
      const menu = castTo<Menu>(MenuCls.create2__());
      menu.items = [];
      const next = vi.fn().mockReturnValue(menu);
      const target = createLinkTarget({ isExternalUrl: true, isWikilink: false, url: 'https://example.com' });
      const evt = castTo<MouseEvent>({ target });

      plugin['showAtMouseEvent'](next, menu, evt);

      expect(handleExternalLinkContextMenu).toHaveBeenCalledWith(menu, 'https://example.com');
      target.remove();
    });

    it('should add an internal link context menu for internal links', () => {
      const plugin = createPlugin();
      const handleLinkContextMenu = vi.fn();
      plugin.app = strictProxy<App>({
        workspace: {
          getActiveFile: vi.fn().mockReturnValue(makeTFile('current.md')),
          handleLinkContextMenu
        }
      });
      const menu = castTo<Menu>(MenuCls.create2__());
      menu.items = [];
      const next = vi.fn().mockReturnValue(menu);
      const target = createLinkTarget({ isExternalUrl: false, isWikilink: false, url: 'note.md' });
      const evt = castTo<MouseEvent>({ target });

      plugin['showAtMouseEvent'](next, menu, evt);

      expect(handleLinkContextMenu).toHaveBeenCalledWith(menu, 'note.md', 'current.md');
      target.remove();
    });

    it('should use an empty source path when there is no active file', () => {
      const plugin = createPlugin();
      const handleLinkContextMenu = vi.fn();
      plugin.app = strictProxy<App>({
        workspace: {
          getActiveFile: vi.fn().mockReturnValue(null),
          handleLinkContextMenu
        }
      });
      const menu = castTo<Menu>(MenuCls.create2__());
      menu.items = [];
      const next = vi.fn().mockReturnValue(menu);
      const target = createLinkTarget({ isExternalUrl: false, isWikilink: false, url: 'note.md' });
      const evt = castTo<MouseEvent>({ target });

      plugin['showAtMouseEvent'](next, menu, evt);

      expect(handleLinkContextMenu).toHaveBeenCalledWith(menu, 'note.md', '');
      target.remove();
    });
  });

  describe('handleMouseDown with no target', () => {
    it('should do nothing when the event has no target', () => {
      const plugin = createPlugin();
      plugin.app = strictProxy<App>({
        workspace: {
          getActiveViewOfType: vi.fn().mockReturnValue(null)
        }
      });
      const evt = castTo<MouseEvent>({ button: 0, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn(), target: null });

      plugin['handleMouseDown'](evt);

      expect(evt.preventDefault).not.toHaveBeenCalled();
    });
  });

  describe('handleMouseOver with active markdown view', () => {
    it('should use the markdown view hover source when triggering hover-link', () => {
      const plugin = createPlugin();
      const trigger = vi.fn();
      const markdownView = castTo<MarkdownView>({
        getHoverSource: vi.fn().mockReturnValue('preview')
      });
      plugin.app = strictProxy<App>({
        workspace: {
          getActiveViewOfType: vi.fn().mockReturnValue(markdownView),
          trigger
        }
      });
      const target = activeDocument.createElement('div');
      target.setAttribute(
        'data-frontmatter-markdown-links-link-data',
        JSON.stringify({ isExternalUrl: false, isWikilink: false, url: 'note.md' })
      );
      activeDocument.body.appendChild(target);
      const evt = castTo<MouseEvent>({ preventDefault: vi.fn(), target });

      plugin['handleMouseOver'](evt);

      expect(trigger).toHaveBeenCalledWith('hover-link', expect.objectContaining({ source: 'preview' }));
      target.remove();
    });
  });

  describe('processFrontmatterLinks filtering', () => {
    it('should drop existing frontmatter links for the same key before reprocessing', () => {
      const plugin = createPlugin();
      plugin.app = createMockApp();
      const cache: CachedMetadata = {
        frontmatterLinks: [
          { displayText: 'old', key: 'key', link: 'old-target', original: 'old' },
          { displayText: 'other', key: 'other', link: 'other-target', original: 'other' }
        ]
      };

      plugin['processFrontmatterLinks']('[note](target.md)', 'key', cache, 'file.md');

      const keyLinks = (cache.frontmatterLinks ?? []).filter((link) => link.key === 'key');
      // The stale 'old-target' entry for 'key' must be filtered out and replaced by the reprocessed link.
      expect(keyLinks).toHaveLength(1);
      expect(keyLinks[0]?.link).toBe('target.md');
      expect((cache.frontmatterLinks ?? []).map((link) => link.key)).toContain('other');
    });
  });

  describe('refreshMarkdownViews with leaves', () => {
    function createMarkdownLeaf(rawFrontmatter: string, synchronize: () => void): WorkspaceLeaf {
      const view = Object.create(MarkdownView.prototype);
      Object.assign(view, {
        metadataEditor: { synchronize },
        rawFrontmatter
      });
      return castTo<WorkspaceLeaf>({ view });
    }

    it('should skip leaves whose view is not a MarkdownView', () => {
      const plugin = createPlugin();
      const synchronize = vi.fn();
      const nonMarkdownLeaf = castTo<WorkspaceLeaf>({ view: castTo<WorkspaceLeaf['view']>({}) });
      vi.mocked(plugin.app.workspace.getLeavesOfType).mockReturnValue([nonMarkdownLeaf]);

      plugin['refreshMarkdownViews']();

      expect(synchronize).not.toHaveBeenCalled();
    });

    it('should synchronize the metadata editor for markdown leaves', () => {
      const plugin = createPlugin();
      const synchronize = vi.fn();
      const leaf = createMarkdownLeaf('title: Hello', synchronize);
      vi.mocked(plugin.app.workspace.getLeavesOfType).mockReturnValue([leaf]);

      plugin['refreshMarkdownViews']();

      expect(synchronize).toHaveBeenCalledTimes(2);
      expect(synchronize).toHaveBeenLastCalledWith({ title: 'Hello' });
    });
  });

  describe('processAllNotes processItem', () => {
    type ProcessItemFn = (note: TFile) => Promise<void>;

    interface CaptureProcessItemResult {
      cacheInstance: MockCacheInstanceAccess & ValidCacheInstance;
      processItem: ProcessItemFn;
    }

    async function captureProcessItem(plugin: Plugin): Promise<CaptureProcessItemResult> {
      // ProcessAllNotes constructs a brand-new cache instance, so override the next one.
      const nextInstance = createMockCacheInstance() as CaptureProcessItemResult['cacheInstance'];
      mockCacheConstructor.mockImplementationOnce(function mockNextCacheInstance(this: Record<string, unknown>) {
        Object.assign(this, nextInstance);
        return this;
      });
      await plugin['processAllNotes']();
      const loopParams = vi.mocked(loop).mock.calls.at(-1)?.[0];
      return {
        cacheInstance: nextInstance,
        processItem: castTo<ProcessItemFn>(loopParams?.processItem)
      };
    }

    it('should process invalid-cache notes via processFrontmatterLinksInFile', async () => {
      const plugin = createPlugin();
      const note = makeTFile('note.md');
      const processSpy = vi.spyOn(castTo<ProcessFrontmatterLinksInFileAccess>(plugin), 'processFrontmatterLinksInFile')
        .mockResolvedValue(undefined);
      vi.mocked(getCacheSafe).mockResolvedValue({});
      const { processItem } = await captureProcessItem(plugin);

      await processItem(note);

      expect(processSpy).toHaveBeenCalledWith(note, expect.any(Object));
    });

    it('should return early for invalid-cache notes when no cache is available', async () => {
      const plugin = createPlugin();
      const note = makeTFile('note.md');
      const processSpy = vi.spyOn(castTo<ProcessFrontmatterLinksInFileAccess>(plugin), 'processFrontmatterLinksInFile')
        .mockResolvedValue(undefined);
      vi.mocked(getCacheSafe).mockResolvedValue(null);
      const { processItem } = await captureProcessItem(plugin);

      await processItem(note);

      expect(processSpy).not.toHaveBeenCalled();
    });

    it('should return early for valid-cache notes with no cached links', async () => {
      const plugin = createPlugin();
      const note = makeTFile('note.md');
      const { cacheInstance, processItem } = await captureProcessItem(plugin);
      cacheInstance.isCacheValid.mockReturnValue(true);
      cacheInstance.getLinks.mockReturnValue([]);
      vi.mocked(getCacheSafe).mockClear();

      await processItem(note);

      expect(vi.mocked(getCacheSafe)).not.toHaveBeenCalled();
    });

    it('should return early for valid-cache notes when getCacheSafe returns null', async () => {
      const plugin = createPlugin();
      const note = makeTFile('note.md');
      const { cacheInstance, processItem } = await captureProcessItem(plugin);
      cacheInstance.isCacheValid.mockReturnValue(true);
      cacheInstance.getLinks.mockReturnValue([{ displayText: 'd', key: 'key', link: 'target.md', original: 'orig' }]);
      vi.mocked(getCacheSafe).mockResolvedValue(null);
      const updateSpy = vi.spyOn(castTo<UpdateResolvedOrUnresolvedLinksCacheAccess>(plugin), 'updateResolvedOrUnresolvedLinksCache');

      await processItem(note);

      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('should restore obsidian links and delete keys whose value changed', async () => {
      const plugin = createPlugin();
      const note = makeTFile('note.md');
      const { cacheInstance, processItem } = await captureProcessItem(plugin);
      cacheInstance.isCacheValid.mockReturnValue(true);
      cacheInstance.getLinks.mockReturnValue([{ displayText: 'd', key: 'key', link: 'target.md', original: 'expected-original' }]);
      const obsidianLink = { displayText: 'obs', key: 'key', link: 'obs-target.md', original: 'obs' };
      vi.mocked(getCacheSafe).mockResolvedValue({
        frontmatter: castTo<FrontMatterCache>({ key: 'different-value' }),
        frontmatterLinks: [obsidianLink]
      });

      await processItem(note);

      expect(cacheInstance.deleteKey).toHaveBeenCalledWith('note.md', 'key');
    });

    it('should keep matching links and update the resolved-links cache', async () => {
      const plugin = createPlugin();
      plugin.app = createMockApp();
      const note = makeTFile('note.md');
      const { cacheInstance, processItem } = await captureProcessItem(plugin);
      cacheInstance.isCacheValid.mockReturnValue(true);
      cacheInstance.getLinks.mockReturnValue([{ displayText: 'd', key: 'key', link: 'target.md', original: 'expected-original' }]);
      vi.mocked(getCacheSafe).mockResolvedValue({
        frontmatter: castTo<FrontMatterCache>({ key: 'expected-original' }),
        frontmatterLinks: []
      });
      const updateSpy = vi.spyOn(castTo<UpdateResolvedOrUnresolvedLinksCacheAccess>(plugin), 'updateResolvedOrUnresolvedLinksCache');

      await processItem(note);

      expect(updateSpy).toHaveBeenCalledWith('target.md', 'note.md');
    });

    it('should iterate the markdown files returned by getMarkdownFilesSorted', async () => {
      const plugin = createPlugin();
      vi.mocked(getMarkdownFilesSorted).mockReturnValue([makeTFile('a.md')]);

      await plugin['processAllNotes']();

      const loopParams = vi.mocked(loop).mock.calls.at(-1)?.[0];
      expect(loopParams?.items).toHaveLength(1);
    });
  });

  describe('noteGet', () => {
    interface NoteLike {
      data: Record<string, unknown>;
    }

    function createNote(value: unknown): NoteLike {
      return { data: { key: value } };
    }

    it('should patch the external link and list prototypes on first access and restore the value', () => {
      const plugin = createPlugin();
      const note = createNote('[Example](https://example.com)');
      const externalLinkControl = { renderTo: vi.fn() };
      const listControl = { renderTo: vi.fn() };
      const finalControl = { renderTo: vi.fn() };
      const next = vi.fn()
        .mockReturnValueOnce(externalLinkControl)
        .mockReturnValueOnce(listControl)
        .mockReturnValueOnce(finalControl);

      const result = plugin['noteGet'](
        castTo<Parameters<typeof plugin['noteGet']>[0]>(next),
        castTo<Parameters<typeof plugin['noteGet']>[1]>(note),
        'key'
      );

      expect(result).toBe(finalControl);
      // The value is restored after each temporary mutation.
      expect(note.data['key']).toBe('[Example](https://example.com)');
      // Two prototypes patched (external link + list).
      const renderToPatches = mockRegisterPatch.mock.calls.filter((call) => Boolean(call[1]) && 'renderTo' in castTo<object>(call[1]));
      expect(renderToPatches.length).toBe(2);
    });

    it('should not re-patch the prototypes on subsequent access', () => {
      const plugin = createPlugin();
      plugin['isBasesExternalLinkPatched'] = true;
      const note = createNote('plain');
      const control = { renderTo: vi.fn() };
      const next = vi.fn().mockReturnValue(control);
      mockRegisterPatch.mockClear();

      const result = plugin['noteGet'](
        castTo<Parameters<typeof plugin['noteGet']>[0]>(next),
        castTo<Parameters<typeof plugin['noteGet']>[1]>(note),
        'key'
      );

      expect(result).toBe(control);
      expect(mockRegisterPatch).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should wire the external-link renderTo patch through the plugin', () => {
      const plugin = createPlugin();
      const note = createNote('value');
      const externalLinkControl = { renderTo: vi.fn() };
      const listControl = { renderTo: vi.fn() };
      const next = vi.fn()
        .mockReturnValueOnce(externalLinkControl)
        .mockReturnValueOnce(listControl)
        .mockReturnValue({ renderTo: vi.fn() });

      plugin['noteGet'](
        castTo<Parameters<typeof plugin['noteGet']>[0]>(next),
        castTo<Parameters<typeof plugin['noteGet']>[1]>(note),
        'key'
      );

      const renderToFactories = mockRegisterPatch.mock.calls
        .map((call) => castTo<RenderToPatchFactory>(call[1]).renderTo)
        .filter((factory): factory is (next: AnyFn) => AnyFn => Boolean(factory));
      const externalRenderToSpy = vi.spyOn(castTo<BasesExternalLinkRenderToAccess>(plugin), 'basesExternalLinkRenderTo');
      const listRenderToSpy = vi.spyOn(castTo<BasesListRenderToAccess>(plugin), 'basesListRenderTo');
      const innerNext = vi.fn();
      const containerEl = activeDocument.createElement('div');
      const renderContext = castTo<Parameters<typeof plugin['basesExternalLinkRenderTo']>[3]>({});

      castTo<(this: object, containerEl: HTMLElement, renderContext: object) => void>(renderToFactories[0]?.(innerNext))
        .call(externalLinkControl, containerEl, renderContext);
      castTo<(this: object, containerEl: HTMLElement, renderContext: object) => void>(renderToFactories[1]?.(innerNext))
        .call(listControl, containerEl, renderContext);

      expect(externalRenderToSpy).toHaveBeenCalled();
      expect(listRenderToSpy).toHaveBeenCalled();
    });
  });

  describe('handleActiveLeafChange', () => {
    function createBasesLeaf(): WorkspaceLeaf {
      const ctx = new MockBasesContext();
      return castTo<WorkspaceLeaf>({
        loadIfDeferred: vi.fn().mockResolvedValue(undefined),
        view: {
          controller: { ctx },
          getViewType: vi.fn().mockReturnValue(ViewType.Bases)
        }
      });
    }

    function createAppWithBasesEnabled(overrides: Partial<App>): App {
      return castTo<App>({
        internalPlugins: {
          getEnabledPluginById: vi.fn().mockReturnValue({})
        },
        ...overrides
      });
    }

    it('should return early when the bases view is already patched', async () => {
      const plugin = createPlugin();
      plugin['isBasesViewPatched'] = true;
      const getEnabledPluginById = vi.fn();
      plugin.app = castTo<App>({ internalPlugins: { getEnabledPluginById } });

      await plugin['handleActiveLeafChange'](createBasesLeaf());

      expect(getEnabledPluginById).not.toHaveBeenCalled();
    });

    it('should return early when the bases plugin is not enabled', async () => {
      const plugin = createPlugin();
      plugin.app = castTo<App>({
        internalPlugins: { getEnabledPluginById: vi.fn().mockReturnValue(null) }
      });

      await plugin['handleActiveLeafChange'](createBasesLeaf());

      expect(plugin['isBasesViewPatched']).toBe(false);
    });

    it('should return early when the leaf is null', async () => {
      const plugin = createPlugin();
      plugin.app = createAppWithBasesEnabled({});

      await plugin['handleActiveLeafChange'](null);

      expect(plugin['isBasesViewPatched']).toBe(false);
    });

    it('should return early when the leaf view is not a bases view', async () => {
      const plugin = createPlugin();
      plugin.app = createAppWithBasesEnabled({});
      const leaf = castTo<WorkspaceLeaf>({
        view: { getViewType: vi.fn().mockReturnValue('markdown') }
      });

      await plugin['handleActiveLeafChange'](leaf);

      expect(plugin['isBasesViewPatched']).toBe(false);
    });

    it('should patch the note prototype using an existing markdown file', async () => {
      const plugin = createPlugin();
      const existingFile = makeTFile('existing.md');
      plugin.app = createAppWithBasesEnabled({
        vault: castTo<App['vault']>({
          getMarkdownFiles: vi.fn().mockReturnValue([existingFile])
        })
      });

      await plugin['handleActiveLeafChange'](createBasesLeaf());

      expect(plugin['isBasesViewPatched']).toBe(true);
      expect(vi.mocked(trashSafe)).not.toHaveBeenCalled();
      const getPatch = mockRegisterPatch.mock.calls.find((call) => Boolean(call[1]) && 'get' in castTo<object>(call[1]));
      expect(getPatch).toBeDefined();
    });

    it('should create and trash a temporary markdown file when none exist', async () => {
      const plugin = createPlugin();
      const tempFile = makeTFile('__TEMP__.md');
      const create = vi.fn().mockResolvedValue(tempFile);
      plugin.app = createAppWithBasesEnabled({
        vault: castTo<App['vault']>({
          create,
          getMarkdownFiles: vi.fn().mockReturnValue([])
        })
      });

      await plugin['handleActiveLeafChange'](createBasesLeaf());

      expect(create).toHaveBeenCalled();
      expect(vi.mocked(trashSafe)).toHaveBeenCalledWith(plugin.app, tempFile);
      expect(plugin['isBasesViewPatched']).toBe(true);
    });

    it('should wire the note get patch through the plugin', async () => {
      const plugin = createPlugin();
      plugin.app = createAppWithBasesEnabled({
        vault: castTo<App['vault']>({
          getMarkdownFiles: vi.fn().mockReturnValue([makeTFile('existing.md')])
        })
      });

      await plugin['handleActiveLeafChange'](createBasesLeaf());

      const getFactory = mockRegisterPatch.mock.calls
        .map((call) => castTo<GetPatchFactory>(call[1]).get)
        .find((factory): factory is (next: AnyFn) => AnyFn => Boolean(factory));
      const noteGetSpy = vi.spyOn(castTo<NoteGetAccess>(plugin), 'noteGet').mockReturnValue(castTo<ReturnType<typeof plugin['noteGet']>>({}));
      const innerNext = vi.fn();
      const note = { data: {} };
      castTo<(this: object, key: string) => unknown>(getFactory?.(innerNext)).call(note, 'key');

      expect(noteGetSpy).toHaveBeenCalled();
    });
  });

  describe('onLayoutReady bases handling', () => {
    it('should register an active-leaf-change listener when no bases view is patched', async () => {
      const plugin = createPlugin();
      const pendingPromises: Promise<unknown>[] = [];
      vi.mocked(invokeAsyncSafely).mockImplementation((fn: () => unknown) => {
        pendingPromises.push(Promise.resolve(fn()));
      });
      const on = vi.fn().mockReturnValue({});
      plugin.app = castTo<App>({
        internalPlugins: { getEnabledPluginById: vi.fn().mockReturnValue(null) },
        metadataCache: { on: vi.fn().mockReturnValue({}) },
        vault: { on: vi.fn().mockReturnValue({}) },
        workspace: {
          activeEditor: null,
          getLeavesOfType: vi.fn().mockReturnValue([]),
          on
        }
      });
      const registerEvent = vi.fn();
      castTo<RegisterEventAccess>(plugin).registerEvent = registerEvent;

      plugin['onLayoutReady']();
      await Promise.all(pendingPromises);

      expect(on).toHaveBeenCalledWith('active-leaf-change', expect.any(Function));
    });

    it('should patch the showAtMouseEvent through the plugin', () => {
      const plugin = createPlugin();
      plugin['onLayoutReady']();

      const showAtMouseEventFactory = mockRegisterPatch.mock.calls
        .map((call) => castTo<ShowAtMouseEventPatchFactory>(call[1]).showAtMouseEvent)
        .find((factory): factory is (next: AnyFn) => AnyFn => Boolean(factory));
      const showAtMouseEventSpy = vi.spyOn(castTo<ShowAtMouseEventAccess>(plugin), 'showAtMouseEvent')
        .mockReturnValue(castTo<Menu>({}));
      const innerNext = vi.fn();
      const menu = castTo<Menu>(MenuCls.create2__());
      const evt = castTo<MouseEvent>({ target: null });
      castTo<(this: Menu, evt: MouseEvent) => unknown>(showAtMouseEventFactory?.(innerNext)).call(menu, evt);

      expect(showAtMouseEventSpy).toHaveBeenCalled();
    });

    it('should not register an active-leaf-change listener once the bases view is patched', async () => {
      const plugin = createPlugin();
      const pendingPromises: Promise<unknown>[] = [];
      vi.mocked(invokeAsyncSafely).mockImplementation((fn: () => unknown) => {
        pendingPromises.push(Promise.resolve(fn()));
      });
      const basesLeaf = castTo<WorkspaceLeaf>({
        loadIfDeferred: vi.fn().mockResolvedValue(undefined),
        view: {
          controller: { ctx: new MockBasesContext() },
          getViewType: vi.fn().mockReturnValue(ViewType.Bases)
        }
      });
      const on = vi.fn().mockReturnValue({});
      plugin.app = castTo<App>({
        internalPlugins: { getEnabledPluginById: vi.fn().mockReturnValue({}) },
        metadataCache: { on: vi.fn().mockReturnValue({}) },
        vault: {
          getMarkdownFiles: vi.fn().mockReturnValue([makeTFile('existing.md')]),
          on: vi.fn().mockReturnValue({})
        },
        workspace: {
          activeEditor: null,
          getLeavesOfType: vi.fn().mockReturnValue([basesLeaf]),
          on
        }
      });
      castTo<RegisterEventAccess>(plugin).registerEvent = vi.fn();

      plugin['onLayoutReady']();
      await Promise.all(pendingPromises);

      expect(on).not.toHaveBeenCalledWith('active-leaf-change', expect.any(Function));
      expect(plugin['isBasesViewPatched']).toBe(true);
    });
  });

  describe('additional branch coverage', () => {
    it('should keep remaining frontmatter links in clearMetadataCache when not all keys match', async () => {
      const plugin = createPlugin();
      const tfile = makeTFile('file.md');
      vi.mocked(plugin['frontmatterMarkdownLinksCache'].getFilePaths).mockReturnValue(['file.md']);
      vi.mocked(plugin['frontmatterMarkdownLinksCache'].getKeys).mockReturnValue(['key1']);
      const remainingLink = { displayText: 'keep', key: 'key2', link: 'keep-target', original: 'keep' };
      const cacheToClear: CachedMetadata = {
        frontmatterLinks: [
          { displayText: 'drop', key: 'key1', link: 'target', original: 'orig' },
          remainingLink
        ]
      };
      vi.mocked(plugin.app.metadataCache.getCache).mockReturnValue(cacheToClear);
      vi.mocked(plugin.app.vault.getFileByPath).mockReturnValue(tfile);
      vi.mocked(plugin.app.vault.read).mockResolvedValue('content');

      await plugin['clearMetadataCache']();

      expect(cacheToClear.frontmatterLinks).toEqual([remainingLink]);
    });

    it('should use the URL as the anchor text when an external link has no alias', () => {
      const plugin = createPlugin();
      plugin['externalLinkMaxId'] = 1;
      plugin['externalLinks'].set(1, {
        endOffset: 0,
        isEmbed: false,
        isExternal: true,
        isWikilink: false,
        raw: 'https://example.com',
        startOffset: 0,
        url: 'https://example.com'
      });
      const container = activeDocument.createElement('div');
      const a = activeDocument.createElement('a');
      a.href = 'https://EXTERNAL_LINK_PREFIX.com/1';
      container.appendChild(a);

      plugin['fixExternalLinks'](container);

      expect(a.textContent).toBe('https://example.com');
    });

    it('should open an external URL in the same tab on left-click', () => {
      const plugin = createPlugin();
      plugin.app = strictProxy<App>({
        workspace: {
          getActiveViewOfType: vi.fn().mockReturnValue(null)
        }
      });
      const openSpy = vi.spyOn(activeWindow, 'open').mockReturnValue(null);
      const target = activeDocument.createElement('div');
      target.setAttribute(
        'data-frontmatter-markdown-links-link-data',
        JSON.stringify({ isExternalUrl: true, isWikilink: false, url: 'https://example.com' })
      );
      activeDocument.body.appendChild(target);
      const evt = castTo<MouseEvent>({ button: 0, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn(), target });

      plugin['handleMouseDown'](evt);

      expect(openSpy).toHaveBeenCalledWith('https://example.com', '');
      openSpy.mockRestore();
      target.remove();
    });

    it('should create offset-based links for multi-link frontmatter values', () => {
      const plugin = createPlugin();
      plugin.app = createMockApp();
      const cache: CachedMetadata = {};

      plugin['processFrontmatterLinks']('text [a](x.md) and [b](y.md)', 'key', cache, 'file.md');

      const offsetLink = (cache.frontmatterLinks ?? []).find((link) => 'startOffset' in link);
      expect(offsetLink).toBeDefined();
    });

    it('should not restore an obsidian link when none exists for a changed key', async () => {
      const plugin = createPlugin();
      const note = makeTFile('note.md');
      const nextInstance = createMockCacheInstance() as MockCacheInstanceAccess & ValidCacheInstance;
      mockCacheConstructor.mockImplementationOnce(function mockNextCacheInstance(this: Record<string, unknown>) {
        Object.assign(this, nextInstance);
        return this;
      });
      await plugin['processAllNotes']();
      const processItem = castTo<(note: TFile) => Promise<void>>(vi.mocked(loop).mock.calls.at(-1)?.[0]?.processItem);
      nextInstance.isCacheValid.mockReturnValue(true);
      nextInstance.getLinks.mockReturnValue([{ displayText: 'd', key: 'key', link: 'target.md', original: 'expected-original' }]);
      vi.mocked(getCacheSafe).mockResolvedValue({
        frontmatter: castTo<FrontMatterCache>({ key: 'changed-value' }),
        frontmatterLinks: []
      });

      await processItem(note);

      expect(nextInstance.deleteKey).toHaveBeenCalledWith('note.md', 'key');
    });

    it('should default to an empty frontmatter object when the cache has none', async () => {
      const plugin = createPlugin();
      const note = makeTFile('note.md');
      const nextInstance = createMockCacheInstance() as MockCacheInstanceAccess & ValidCacheInstance;
      mockCacheConstructor.mockImplementationOnce(function mockNextCacheInstance(this: Record<string, unknown>) {
        Object.assign(this, nextInstance);
        return this;
      });
      await plugin['processAllNotes']();
      const processItem = castTo<(note: TFile) => Promise<void>>(vi.mocked(loop).mock.calls.at(-1)?.[0]?.processItem);
      nextInstance.isCacheValid.mockReturnValue(true);
      nextInstance.getLinks.mockReturnValue([{ displayText: 'd', key: 'key', link: 'target.md', original: 'orig' }]);
      vi.mocked(getCacheSafe).mockResolvedValue({ frontmatterLinks: [] });

      await processItem(note);

      // With no frontmatter, the value differs from the original, so the key is deleted.
      expect(nextInstance.deleteKey).toHaveBeenCalledWith('note.md', 'key');
    });
  });
});

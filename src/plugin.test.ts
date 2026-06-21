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
import { waitForAllAsyncOperations } from 'obsidian-dev-utils/async';
import {
  noop,
  noopAsync
} from 'obsidian-dev-utils/function';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { AbortSignalComponent } from 'obsidian-dev-utils/obsidian/components/abort-signal-component';
import { MonkeyAroundComponent } from 'obsidian-dev-utils/obsidian/components/monkey-around-component';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';
import {
  App as AppCls,
  MarkdownView,
  Menu as MenuCls,
  MenuItem,
  TFile as TFileCls,
  Vault as VaultCls
} from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { PluginSettingsComponent } from './plugin-settings-component.ts';

import { registerFrontmatterLinksEditorExtension } from './frontmatter-links-editor-extension.ts';
import { patchMultiTextPropertyWidgetComponent } from './multi-text-property-widget-component.ts';
import { PluginSettings } from './plugin-settings.ts';
import { patchTextPropertyWidgetComponent } from './text-property-widget-component.ts';

type AnyFn = (...args: never[]) => unknown;

interface AugmentedWorkspaceApp {
  internalPlugins: InternalPluginsLike;
  workspace: AugmentedWorkspaceLike;
}

interface AugmentedWorkspaceLike {
  getLeavesOfType: GetLeavesOfTypeFn;
  on: WorkspaceOn;
}

interface BasesControllerHolder {
  controller: BasesControllerLike;
}

interface BasesControllerLike {
  ctx: MockBasesContext;
}

interface BasesExternalLinkRenderToAccess {
  basesExternalLinkRenderTo: AnyFn;
}

interface BasesListRenderToAccess {
  basesListRenderTo: AnyFn;
}

interface BasesLocal {
  note: BasesNoteLike;
}

interface BasesNoteGetter {
  get(key: string): unknown;
}

interface BasesNoteLike {
  data: Record<string, unknown>;
  get(key: string): unknown;
}

interface ClearMetadataCacheAccess {
  clearMetadataCache: AnyFn;
}

interface ComponentModuleActual {
  Component: new () => object;
}

interface FileManagerLike {
  runAsyncLinkUpdate: ReturnType<typeof vi.fn>;
}

interface FileManagerWithLinkUpdate {
  fileManager: FileManagerLike;
}

interface GetClickableTokenAtAccess {
  getClickableTokenAt: AnyFn;
}

interface InternalPluginsLike {
  getEnabledPluginById(id: string): unknown;
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

interface ObsidianDevUtilsStateApp {
  obsidianDevUtilsState: object;
}

interface ObsidianDevUtilsStateHolder {
  value: unknown;
}

interface OnLayoutReadyAccess {
  onLayoutReady(): void;
}

interface ProcessFrontmatterLinksInFileAccess {
  processFrontmatterLinksInFile: AnyFn;
}

interface RefreshMarkdownViewsAccess {
  refreshMarkdownViews(): void;
}

interface RenderToControl {
  renderTo(containerEl: HTMLElement, renderContext: object): void;
}

interface ShowAtMouseEventAccess {
  showAtMouseEvent: AnyFn;
}

interface UpdateResolvedOrUnresolvedLinksCacheAccess {
  updateResolvedOrUnresolvedLinksCache: AnyFn;
}

interface ValidCacheInstance {
  deleteKey: ReturnType<typeof vi.fn>;
  getLinks: ReturnType<typeof vi.fn>;
  isCacheValid: ReturnType<typeof vi.fn>;
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
    // The note's `get` method must live on a real prototype so the source's `getPrototypeOf(note)`
    // Patch (via monkey-around) has a method to wrap.
    this._local = { note: new BasesNoteProto() };
  }
}

// Stub the plugin's OWN sibling modules (allowed test doubles). The component stub extends the real
// Test-mocks `Component` so the real `PluginBase` lifecycle can load it as a child without pulling in
// The heavy settings-base dependencies.
vi.mock('./plugin-settings-component.ts', async () => {
  const { Component } = await vi.importActual<ComponentModuleActual>('obsidian');
  class PluginSettingsComponent extends Component {
    public settings = new PluginSettings();
  }
  return { PluginSettingsComponent };
});

vi.mock('./plugin-settings-tab.ts', () => ({
  PluginSettingsTab: vi.fn()
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

// Stub the RETURN VALUE of specific dev-utils utility functions (allowed test doubles), spreading the
// Real module so the other exports the real dev-utils components depend on remain intact.
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

// Keep the REAL `invokeAsyncSafely`/`convertAsyncToSync` so fire-and-forget work is tracked and can be
// Drained via `waitForAllAsyncOperations()` (async-operation tracking is wired in the unit-test setup).
// Only stub `requestAnimationFrameAsync`, whose real rAF never resolves under jsdom.
vi.mock('obsidian-dev-utils/async', async (importOriginal) => {
  const actual = await importOriginal<typeof import('obsidian-dev-utils/async')>();
  return {
    ...actual,
    requestAnimationFrameAsync: vi.fn().mockResolvedValue(undefined)
  };
});

// The REAL `PluginBase` (and the dev-utils notice/context/debug children it loads) read a shared-state
// Bag off the app via `getObsidianDevUtilsState`. The strict App mock has no such bag, so stub just
// This one utility. It memoizes per key (like the real holder) so state registered during load — e.g.
// The rename/delete handler's settings-builder map — persists and can be exercised by later triggers.
const { obsidianDevUtilsStateByKey } = vi.hoisted(() => ({
  obsidianDevUtilsStateByKey: new Map<string, ObsidianDevUtilsStateHolder>()
}));

vi.mock('obsidian-dev-utils/obsidian/app', async (importOriginal) => {
  const actual = await importOriginal<typeof import('obsidian-dev-utils/obsidian/app')>();
  return {
    ...actual,
    getObsidianDevUtilsState: vi.fn((_app: unknown, key: string, defaultValue: unknown) => {
      let state = obsidianDevUtilsStateByKey.get(key);
      if (!state) {
        state = { value: defaultValue };
        obsidianDevUtilsStateByKey.set(key, state);
      }
      return state;
    })
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

const PLUGIN_MANIFEST: PluginManifest = {
  author: 'test',
  description: 'test',
  id: 'frontmatter-markdown-links',
  minAppVersion: '1.0.0',
  name: 'Frontmatter Markdown Links',
  version: '1.0.0'
};

let savedGlobalApp: App | undefined;
const loadedMonkeyAroundComponents: MonkeyAroundComponent[] = [];

type GetLeavesOfTypeFn = (viewType: string) => WorkspaceLeaf[];

interface LoadPluginWithLayoutReadyOptions {
  readonly basesLeaves?: WorkspaceLeaf[];
  readonly isBasesEnabled?: boolean;
  readonly onLeafChange?: WorkspaceOn;
}

interface LoadPluginWithLayoutReadyResult {
  readonly app: App;
  readonly plugin: Plugin;
}

type WorkspaceOn = (name: string, callback: AnyFn) => unknown;

function createConfiguredApp(): App {
  const appMock = AppCls.createConfigured__();
  appMock.workspace.onLayoutReady = vi.fn((cb: () => void) => {
    cb();
  });
  const app = appMock.asOriginalType__();
  // The async-operation-tracking setup pre-loads dev-utils' `app` module, so dev-utils' INTERNAL
  // Relative `getObsidianDevUtilsState` call bypasses the public-specifier mock and reads
  // `app.obsidianDevUtilsState` directly off the strict-proxy App; seed the bag so it does not throw.
  castTo<ObsidianDevUtilsStateApp>(app).obsidianDevUtilsState = {};
  // The real RenameDeleteHandlerComponent (added during `onLayoutReady`) loads a child that
  // Monkey-patches `fileManager.runAsyncLinkUpdate`; the strict FileManager mock throws on that
  // Unmocked member, so provide it as a thin stub for the patch to wrap.
  castTo<FileManagerWithLinkUpdate>(app).fileManager.runAsyncLinkUpdate = vi.fn();
  return app;
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

/**
 * Constructs a real `Plugin` (real `PluginBase`) without driving the full `onload()` lifecycle, and wires
 * the minimal collaborators most private-method tests need: a really-loaded `MonkeyAroundComponent` (so
 * `registerPatch` actually patches the target) and a `pluginSettingsComponent` exposing real `PluginSettings`.
 *
 * @param app - The app to construct the plugin with. Defaults to a partial mock app.
 * @returns The constructed plugin.
 */
function createPlugin(app: App = createMockApp()): Plugin {
  const plugin = new Plugin(app, strictProxy<PluginManifest>({ id: 'frontmatter-markdown-links' }));

  // The plugin constructs `monkeyAroundComponent` as a readonly field; load that real instance so
  // `registerPatch` works, and track it for unload to remove its prototype patches afterwards.
  const monkeyAroundComponent = plugin['monkeyAroundComponent'];
  monkeyAroundComponent.load();
  loadedMonkeyAroundComponents.push(monkeyAroundComponent);

  plugin['pluginSettingsComponent'] = castTo<PluginSettingsComponent>({ settings: new PluginSettings() });

  // `onloadImpl` is not run here, so the real `PluginBase`'s abort-signal component is never created.
  // The real `AbortSignalComponent` is side-effect-free to construct; assign it so private methods that
  // Read `this.abortSignalComponent` (e.g. `processAllNotes`, `onLayoutReady`) work without driving load.
  plugin['abortSignalComponent'] = new AbortSignalComponent(plugin.manifest.id);

  return plugin;
}

/**
 * Drives the REAL `PluginBase` lifecycle: builds a fully-configured app (augmented with the
 * `internalPlugins`/`activeEditor` surface the plugin's `onLayoutReady` touches), points
 * `globalThis.app` at it (the source reads the global `app` when constructing the layout-ready
 * component), then `await plugin.onload()`. Because the configured app's `onLayoutReady` fires
 * synchronously and the real `CallbackLayoutReadyComponent` schedules via `window.setTimeout(0)`,
 * the plugin's private `onLayoutReady` runs through the real load path. Waits for it to complete.
 *
 * @param options - Behavior overrides for the bases-handling path.
 * @returns The loaded plugin and its app.
 */
async function loadPluginWithLayoutReady(options: LoadPluginWithLayoutReadyOptions = {}): Promise<LoadPluginWithLayoutReadyResult> {
  const app = createConfiguredApp();
  const augmented = castTo<AugmentedWorkspaceApp>(app);
  augmented.internalPlugins = {
    getEnabledPluginById: vi.fn().mockReturnValue(options.isBasesEnabled ? {} : null)
  };
  const realGetLeavesOfType: GetLeavesOfTypeFn = augmented.workspace.getLeavesOfType.bind(augmented.workspace);
  augmented.workspace.getLeavesOfType = (viewType: string): WorkspaceLeaf[] => {
    if (viewType === ViewType.Bases) {
      return options.basesLeaves ?? [];
    }
    return realGetLeavesOfType(viewType);
  };
  const onLeafChange = options.onLeafChange;
  if (onLeafChange) {
    const realOn: WorkspaceOn = augmented.workspace.on.bind(augmented.workspace);
    augmented.workspace.on = (name: string, callback: AnyFn): unknown => {
      if (name === 'active-leaf-change') {
        return onLeafChange(name, callback);
      }
      return realOn(name, callback);
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-deprecated -- the source reads the global `app` in `onloadImpl`; point it at this app for the real lifecycle.
  window.app = app;
  const plugin = new Plugin(app, PLUGIN_MANIFEST);
  await plugin.onload();
  // The layout-ready callback fires fire-and-forget through `window.setTimeout(0)`; wait for the
  // Observable effect (the plugin's `processAllNotes` calling the mocked `loop`).
  await vi.waitFor(() => {
    expect(vi.mocked(loop)).toHaveBeenCalled();
  });
  return { app, plugin };
}
function makeTFile(path: string): TFile {
  const app = AppCls.createConfigured__();
  return castTo<TFile>(TFileCls.create__(app.vault, path));
}

beforeEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- save/restore the global `app` the source reads in `onloadImpl`.
  savedGlobalApp = window.app;
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- point the global `app` at the configured app so the source's global lookup resolves.
  window.app = createConfiguredApp();
});

afterEach(() => {
  // Unload any really-loaded MonkeyAroundComponents so prototype patches (Menu.prototype, editor
  // Prototypes, etc.) are removed and do not leak into later tests.
  for (const component of loadedMonkeyAroundComponents) {
    component.unload();
  }
  loadedMonkeyAroundComponents.length = 0;

  obsidianDevUtilsStateByKey.clear();

  // eslint-disable-next-line @typescript-eslint/no-deprecated -- restore the global `app` saved in `beforeEach`.
  window.app = castTo<App>(savedGlobalApp);

  vi.clearAllMocks();
  // Restore default cache constructor implementation after each test.
  mockCacheConstructor.mockImplementation(createMockCacheInstance);
  // ClearAllMocks resets call history but keeps implementations, so reset the ones
  // That individual tests override to avoid leaking behavior into later tests.
  vi.mocked(getCacheSafe).mockReset().mockResolvedValue(null);
  vi.mocked(getMarkdownFilesSorted).mockReset().mockReturnValue([]);
});

describe('Plugin', () => {
  describe('constructor and onload lifecycle', () => {
    it('should create plugin with a settings component once loaded', async () => {
      const plugin = new Plugin(createConfiguredApp(), PLUGIN_MANIFEST);

      await plugin.onload();

      expect(plugin['pluginSettingsComponent']).toBeDefined();
      plugin.unload();
    });

    it('should run the layout-ready callback during load', async () => {
      const plugin = new Plugin(createConfiguredApp(), PLUGIN_MANIFEST);
      const onLayoutReadySpy = vi.spyOn(castTo<OnLayoutReadyAccess>(plugin), 'onLayoutReady');

      await plugin.onload();

      // The configured app's `onLayoutReady` fires synchronously; the real CallbackLayoutReadyComponent
      // Schedules the callback via `window.setTimeout(0)`, so flush microtasks/timers.
      await vi.waitFor(() => {
        expect(onLayoutReadySpy).toHaveBeenCalled();
      });
      plugin.unload();
    });

    it('should instantiate a MonkeyAroundComponent for monkey patching', async () => {
      const plugin = new Plugin(createConfiguredApp(), PLUGIN_MANIFEST);

      await plugin.onload();

      expect(plugin['monkeyAroundComponent']).toBeInstanceOf(MonkeyAroundComponent);
      plugin.unload();
    });

    it('should call patchTextPropertyWidgetComponent', async () => {
      const plugin = new Plugin(createConfiguredApp(), PLUGIN_MANIFEST);

      await plugin.onload();

      expect(vi.mocked(patchTextPropertyWidgetComponent)).toHaveBeenCalledWith(plugin);
      plugin.unload();
    });

    it('should call patchMultiTextPropertyWidgetComponent', async () => {
      const plugin = new Plugin(createConfiguredApp(), PLUGIN_MANIFEST);

      await plugin.onload();

      expect(vi.mocked(patchMultiTextPropertyWidgetComponent)).toHaveBeenCalledWith(plugin);
      plugin.unload();
    });

    it('should register frontmatter links editor extension', async () => {
      const plugin = new Plugin(createConfiguredApp(), PLUGIN_MANIFEST);

      await plugin.onload();

      expect(vi.mocked(registerFrontmatterLinksEditorExtension)).toHaveBeenCalledWith(plugin);
      plugin.unload();
    });

    it('should call refreshMarkdownViews on load', async () => {
      const plugin = new Plugin(createConfiguredApp(), PLUGIN_MANIFEST);
      const spy = vi.spyOn(castTo<RefreshMarkdownViewsAccess>(plugin), 'refreshMarkdownViews');

      await plugin.onload();

      expect(spy).toHaveBeenCalled();
      plugin.unload();
    });

    it('should register a cleanup callback that clears the metadata cache', async () => {
      const plugin = new Plugin(createConfiguredApp(), PLUGIN_MANIFEST);
      const registered: (() => void)[] = [];
      vi.spyOn(plugin, 'register').mockImplementation((fn: () => void) => {
        registered.push(fn);
      });
      const clearSpy = vi.spyOn(castTo<ClearMetadataCacheAccess>(plugin), 'clearMetadataCache')
        .mockResolvedValue(undefined);

      await plugin.onload();

      const clearCallback = registered[0];
      clearCallback?.();

      // The cleanup fires `clearMetadataCache` fire-and-forget via the real `invokeAsyncSafely`; drain it.
      await waitForAllAsyncOperations();
      expect(clearSpy).toHaveBeenCalled();
      plugin.unload();
    });
  });

  describe('onLayoutReady', () => {
    it('should invoke processAllNotes asynchronously during layout-ready', async () => {
      const { plugin } = await loadPluginWithLayoutReady();

      // `processAllNotes` is fired-and-forgotten from `onLayoutReady`; its observable effect is the
      // Mocked `loop` being driven (already awaited inside `loadPluginWithLayoutReady`).
      expect(vi.mocked(loop)).toHaveBeenCalled();
      plugin.unload();
    });

    it('should really patch Menu.prototype.showAtMouseEvent', async () => {
      const showAtMouseEventSpy = vi.spyOn(castTo<ShowAtMouseEventAccess>(Plugin.prototype), 'showAtMouseEvent')
        .mockReturnValue(castTo<Menu>({}));
      const { plugin } = await loadPluginWithLayoutReady();

      const menu = MenuCls.create2__();
      menu.items__ = [];
      const evt = castTo<MouseEvent>({ target: null });
      // Invoke the REALLY-patched method to prove the patch was installed.
      castTo<Menu>(menu).showAtMouseEvent(evt);

      expect(showAtMouseEventSpy).toHaveBeenCalled();
      showAtMouseEventSpy.mockRestore();
      plugin.unload();
    });

    it('should register the rename/delete handler during layout-ready', async () => {
      const vaultOnSpy = vi.spyOn(VaultCls.prototype, 'on');
      const { plugin } = await loadPluginWithLayoutReady();

      // The real RenameDeleteHandlerComponent registers a vault 'rename' listener on load.
      const renameRegistration = vaultOnSpy.mock.calls.find((call) => call[0] === 'rename');
      expect(renameRegistration).toBeDefined();
      vaultOnSpy.mockRestore();
      plugin.unload();
    });

    it('should feed shouldHandleRenames from settings into the rename/delete handler', async () => {
      const { app, plugin } = await loadPluginWithLayoutReady();
      // With renames disabled, the handler's `getSettings()` still invokes the plugin's settings builder
      // (`shouldHandleRenames: this.pluginSettingsComponent.settings.shouldHandleRenames`) and then
      // Returns early — so the builder is exercised without driving the deep rename machinery.
      castTo<PluginSettings>(ensureNonNullable(plugin['pluginSettingsComponent']).settings).shouldHandleRenames = false;
      const renamedFile = makeTFile('renamed.md');

      expect(() => {
        app.vault.trigger('rename', renamedFile, 'old.md');
      }).not.toThrow();
      plugin.unload();
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

    it('should really patch the editor prototype when activeEditor has an editor', () => {
      const plugin = createPlugin();
      class FakeEditor {
        public getClickableTokenAt(_pos: EditorPosition): ClickableToken | null {
          return null;
        }
      }
      const editorInstance = new FakeEditor();
      plugin.app = castTo<App>({
        workspace: {
          activeEditor: { editor: editorInstance }
        }
      });
      const getClickableTokenAtSpy = vi.spyOn(castTo<GetClickableTokenAtAccess>(plugin), 'getClickableTokenAt')
        .mockReturnValue(null);

      plugin['handleFileOpen']();

      expect(plugin['isEditorPatched']).toBe(true);
      // Invoke the REALLY-patched prototype method to prove the patch routes through the plugin.
      castTo<Editor>(editorInstance).getClickableTokenAt({ ch: 0, line: 0 });
      expect(getClickableTokenAtSpy).toHaveBeenCalled();
    });

    it('should not re-patch when already patched', () => {
      const plugin = createPlugin();
      plugin['isEditorPatched'] = true;
      class FakeEditor {
        public getClickableTokenAt(_pos: EditorPosition): ClickableToken | null {
          return null;
        }
      }
      const editorInstance = new FakeEditor();
      plugin.app = castTo<App>({
        workspace: {
          activeEditor: { editor: editorInstance }
        }
      });
      const getClickableTokenAtSpy = vi.spyOn(castTo<GetClickableTokenAtAccess>(plugin), 'getClickableTokenAt')
        .mockReturnValue(null);

      plugin['handleFileOpen']();

      // No new patch installed, so the plugin method is never reached.
      castTo<Editor>(editorInstance).getClickableTokenAt({ ch: 0, line: 0 });
      expect(getClickableTokenAtSpy).not.toHaveBeenCalled();
    });
  });

  describe('handleMetadataCacheChanged', () => {
    it('should invoke processFrontmatterLinksInFile asynchronously', async () => {
      const plugin = createPlugin();
      const tfile = makeTFile('file.md');
      const cache = strictProxy<CachedMetadata>({ frontmatter: {} });
      const processSpy = vi.spyOn(castTo<ProcessFrontmatterLinksInFileAccess>(plugin), 'processFrontmatterLinksInFile')
        .mockResolvedValue(undefined);

      plugin['handleMetadataCacheChanged'](tfile, 'content', cache);

      // The handler fires `processFrontmatterLinksInFile` fire-and-forget via the real
      // `invokeAsyncSafely`; drain it before asserting the observable effect.
      await waitForAllAsyncOperations();
      expect(processSpy).toHaveBeenCalled();
    });

    it('should process frontmatter links in the changed file', async () => {
      const plugin = createPlugin();
      const tfile = makeTFile('file.md');
      const cache = strictProxy<CachedMetadata>({ frontmatter: {} });
      const processSpy = vi.spyOn(castTo<ProcessFrontmatterLinksInFileAccess>(plugin), 'processFrontmatterLinksInFile')
        .mockResolvedValue(undefined);

      plugin['handleMetadataCacheChanged'](tfile, 'content', cache);
      await waitForAllAsyncOperations();

      expect(processSpy).toHaveBeenCalledWith(tfile, cache, 'content');
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
      plugin.app = createMockApp();
      const cache: CachedMetadata = {};

      const result = plugin['processFrontmatterLinks']('[note](target.md)', 'key', cache, 'file.md');

      expect(result).toBe(true);
      expect(cache.frontmatterLinks).toBeDefined();
      expect(cache.frontmatterLinks?.length).toBeGreaterThan(0);
    });

    it('should process nested object frontmatter recursively', () => {
      const plugin = createPlugin();
      plugin.app = createMockApp();
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
      plugin.app = createMockApp();
      const cache: CachedMetadata = {};

      plugin['processFrontmatterLinks']('[My Note](target.md)', 'key', cache, 'file.md');

      expect(cache.frontmatterLinks?.[0]?.displayText).toBe('My Note');
    });

    it('should populate link with url as displayText when no alias', () => {
      const plugin = createPlugin();
      plugin.app = createMockApp();
      const cache: CachedMetadata = {};

      plugin['processFrontmatterLinks']('[](target.md)', 'key', cache, 'file.md');

      expect(cache.frontmatterLinks?.[0]?.displayText).toBe('target.md');
    });

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

    it('should create offset-based links for multi-link frontmatter values', () => {
      const plugin = createPlugin();
      plugin.app = createMockApp();
      const cache: CachedMetadata = {};

      plugin['processFrontmatterLinks']('text [a](x.md) and [b](y.md)', 'key', cache, 'file.md');

      const offsetLink = (cache.frontmatterLinks ?? []).find((link) => 'startOffset' in link);
      expect(offsetLink).toBeDefined();
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
    function createMarkdownLeaf(rawFrontmatter: string, synchronize: () => void): WorkspaceLeaf {
      const view = Object.create(MarkdownView.prototype) as object;
      Object.assign(view, {
        metadataEditor: { synchronize },
        rawFrontmatter
      });
      return castTo<WorkspaceLeaf>({ view });
    }

    it('should complete without error when no markdown leaves exist', () => {
      const plugin = createPlugin();
      vi.mocked(plugin.app.workspace.getLeavesOfType).mockReturnValue([]);

      expect(() => {
        plugin['refreshMarkdownViews']();
      }).not.toThrow();
    });

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

  describe('showAtMouseEvent', () => {
    function createLinkTarget(linkData: LinkDataShape): HTMLElement {
      const target = activeDocument.createElement('div');
      target.setAttribute('data-frontmatter-markdown-links-link-data', JSON.stringify(linkData));
      activeDocument.body.appendChild(target);
      return target;
    }

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

  describe('handleMouseDown', () => {
    function createLinkTarget(linkData: LinkDataShape): HTMLElement {
      const target = activeDocument.createElement('div');
      target.setAttribute('data-frontmatter-markdown-links-link-data', JSON.stringify(linkData));
      activeDocument.body.appendChild(target);
      return target;
    }

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

    it('should open an external URL in the same tab on left-click', () => {
      const plugin = createPlugin();
      plugin.app = strictProxy<App>({
        workspace: {
          getActiveViewOfType: vi.fn().mockReturnValue(null)
        }
      });
      const openSpy = vi.spyOn(activeWindow, 'open').mockReturnValue(null);
      const target = createLinkTarget({ isExternalUrl: true, isWikilink: false, url: 'https://example.com' });
      const evt = castTo<MouseEvent>({ button: 0, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn(), target });

      plugin['handleMouseDown'](evt);

      expect(openSpy).toHaveBeenCalledWith('https://example.com', '');
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
      const target = createLinkTarget({ isExternalUrl: false, isWikilink: false, url: 'note.md' });
      const evt = castTo<MouseEvent>({ button: 0, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn(), target });

      plugin['handleMouseDown'](evt);
      // The handler opens the link fire-and-forget via the real `invokeAsyncSafely`; drain it.
      await waitForAllAsyncOperations();

      expect(openLinkText).toHaveBeenCalledWith('note.md', 'current.md', false);
      target.remove();
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

    it('should keep remaining frontmatter links when not all keys match', async () => {
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
      expect(loopParams?.shouldShowProgressBar).toBe(ensureNonNullable(plugin['pluginSettingsComponent']).settings.shouldShowInitializationNotice);
    });

    it('should pass buildNoticeMessage to loop that formats note path', async () => {
      const plugin = createPlugin();

      await plugin['processAllNotes']();

      const loopParams = vi.mocked(loop).mock.calls[0]?.[0];
      const note = makeTFile('some/note.md');
      const message = loopParams?.buildNoticeMessage(note, '1/10');
      expect(message).toContain('some/note.md');
    });

    it('should iterate the markdown files returned by getMarkdownFilesSorted', async () => {
      const plugin = createPlugin();
      vi.mocked(getMarkdownFilesSorted).mockReturnValue([makeTFile('a.md')]);

      await plugin['processAllNotes']();

      const loopParams = vi.mocked(loop).mock.calls.at(-1)?.[0];
      expect(loopParams?.items).toHaveLength(1);
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
      const externalLinkProto = { renderTo: noop };
      const listProto = { renderTo: noop };
      const externalLinkControl = castTo<RenderToControl>(Object.create(externalLinkProto));
      const listControl = castTo<RenderToControl>(Object.create(listProto));
      const finalControl = { renderTo: vi.fn() };
      const next = vi.fn()
        .mockReturnValueOnce(externalLinkControl)
        .mockReturnValueOnce(listControl)
        .mockReturnValueOnce(finalControl);
      const externalRenderToSpy = vi.spyOn(castTo<BasesExternalLinkRenderToAccess>(plugin), 'basesExternalLinkRenderTo')
        .mockImplementation(() => undefined);
      const listRenderToSpy = vi.spyOn(castTo<BasesListRenderToAccess>(plugin), 'basesListRenderTo')
        .mockImplementation(() => undefined);

      const result = plugin['noteGet'](
        castTo<Parameters<typeof plugin['noteGet']>[0]>(next),
        castTo<Parameters<typeof plugin['noteGet']>[1]>(note),
        'key'
      );

      expect(result).toBe(finalControl);
      // The value is restored after each temporary mutation.
      expect(note.data['key']).toBe('[Example](https://example.com)');
      // Invoke the REALLY-patched prototypes to prove both were patched through the plugin.
      const containerEl = activeDocument.createElement('div');
      externalLinkControl.renderTo(containerEl, {});
      listControl.renderTo(containerEl, {});
      expect(externalRenderToSpy).toHaveBeenCalled();
      expect(listRenderToSpy).toHaveBeenCalled();
    });

    it('should not re-patch the prototypes on subsequent access', () => {
      const plugin = createPlugin();
      plugin['isBasesExternalLinkPatched'] = true;
      const note = createNote('plain');
      const control = { renderTo: vi.fn() };
      const next = vi.fn().mockReturnValue(control);

      const result = plugin['noteGet'](
        castTo<Parameters<typeof plugin['noteGet']>[0]>(next),
        castTo<Parameters<typeof plugin['noteGet']>[1]>(note),
        'key'
      );

      expect(result).toBe(control);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should wire the external-link renderTo patch through the plugin', () => {
      const plugin = createPlugin();
      const note = createNote('value');
      const externalLinkProto = { renderTo: noop };
      const listProto = { renderTo: noop };
      const externalLinkControl = castTo<RenderToControl>(Object.create(externalLinkProto));
      const listControl = castTo<RenderToControl>(Object.create(listProto));
      const next = vi.fn()
        .mockReturnValueOnce(externalLinkControl)
        .mockReturnValueOnce(listControl)
        .mockReturnValue({ renderTo: vi.fn() });
      const externalRenderToSpy = vi.spyOn(castTo<BasesExternalLinkRenderToAccess>(plugin), 'basesExternalLinkRenderTo')
        .mockImplementation(() => undefined);
      const listRenderToSpy = vi.spyOn(castTo<BasesListRenderToAccess>(plugin), 'basesListRenderTo')
        .mockImplementation(() => undefined);

      plugin['noteGet'](
        castTo<Parameters<typeof plugin['noteGet']>[0]>(next),
        castTo<Parameters<typeof plugin['noteGet']>[1]>(note),
        'key'
      );

      const containerEl = activeDocument.createElement('div');
      externalLinkControl.renderTo(containerEl, {});
      listControl.renderTo(containerEl, {});

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
      const noteGetSpy = vi.spyOn(castTo<NoteGetAccess>(plugin), 'noteGet')
        .mockReturnValue(castTo<ReturnType<typeof plugin['noteGet']>>({}));

      const leaf = createBasesLeaf();
      await plugin['handleActiveLeafChange'](leaf);

      expect(plugin['isBasesViewPatched']).toBe(true);
      expect(vi.mocked(trashSafe)).not.toHaveBeenCalled();
      // Invoke the REALLY-patched note prototype to prove the patch routes through the plugin.
      const ctx = castTo<BasesControllerHolder>(leaf.view).controller.ctx;
      const note = ctx._local.note;
      castTo<BasesNoteGetter>(note).get('key');
      expect(noteGetSpy).toHaveBeenCalled();
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
  });

  describe('onLayoutReady bases handling', () => {
    function createBasesLeaf(): WorkspaceLeaf {
      return castTo<WorkspaceLeaf>({
        loadIfDeferred: vi.fn().mockResolvedValue(undefined),
        view: {
          controller: { ctx: new MockBasesContext() },
          getViewType: vi.fn().mockReturnValue(ViewType.Bases)
        }
      });
    }

    it('should register an active-leaf-change listener when no bases view is patched', async () => {
      const onLeafChange = vi.fn().mockReturnValue({});
      // Bases plugin disabled, so `handleActiveLeafChange` returns early and never patches the view.
      const { plugin } = await loadPluginWithLayoutReady({ isBasesEnabled: false, onLeafChange });

      await vi.waitFor(() => {
        expect(onLeafChange).toHaveBeenCalledWith('active-leaf-change', expect.any(Function));
      });
      plugin.unload();
    });

    it('should not register an active-leaf-change listener once the bases view is patched', async () => {
      const onLeafChange = vi.fn().mockReturnValue({});
      const noteGetSpy = vi.spyOn(castTo<NoteGetAccess>(Plugin.prototype), 'noteGet')
        .mockReturnValue(castTo<ReturnType<Plugin['noteGet']>>({}));
      // Bases plugin enabled and a bases leaf is present, so the view gets patched and no listener is added.
      const { plugin } = await loadPluginWithLayoutReady({
        basesLeaves: [createBasesLeaf()],
        isBasesEnabled: true,
        onLeafChange
      });

      await vi.waitFor(() => {
        expect(plugin['isBasesViewPatched']).toBe(true);
      });
      expect(onLeafChange).not.toHaveBeenCalledWith('active-leaf-change', expect.any(Function));
      noteGetSpy.mockRestore();
      plugin.unload();
    });
  });

  describe('processAllNotes processItem', () => {
    type ProcessItemFn = (note: TFile) => Promise<void>;

    interface CaptureProcessItemResult {
      readonly cacheInstance: MockCacheInstanceAccess & ValidCacheInstance;
      readonly processItem: ProcessItemFn;
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

    it('should not restore an obsidian link when none exists for a changed key', async () => {
      const plugin = createPlugin();
      const note = makeTFile('note.md');
      const { cacheInstance, processItem } = await captureProcessItem(plugin);
      cacheInstance.isCacheValid.mockReturnValue(true);
      cacheInstance.getLinks.mockReturnValue([{ displayText: 'd', key: 'key', link: 'target.md', original: 'expected-original' }]);
      vi.mocked(getCacheSafe).mockResolvedValue({
        frontmatter: castTo<FrontMatterCache>({ key: 'changed-value' }),
        frontmatterLinks: []
      });

      await processItem(note);

      expect(cacheInstance.deleteKey).toHaveBeenCalledWith('note.md', 'key');
    });

    it('should default to an empty frontmatter object when the cache has none', async () => {
      const plugin = createPlugin();
      const note = makeTFile('note.md');
      const { cacheInstance, processItem } = await captureProcessItem(plugin);
      cacheInstance.isCacheValid.mockReturnValue(true);
      cacheInstance.getLinks.mockReturnValue([{ displayText: 'd', key: 'key', link: 'target.md', original: 'orig' }]);
      vi.mocked(getCacheSafe).mockResolvedValue({ frontmatterLinks: [] });

      await processItem(note);

      // With no frontmatter, the value differs from the original, so the key is deleted.
      expect(cacheInstance.deleteKey).toHaveBeenCalledWith('note.md', 'key');
    });
  });
});

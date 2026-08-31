import type {
  App,
  PluginManifest
} from 'obsidian';

import { castTo } from 'obsidian-dev-utils/object-utils';
import { PluginSettingsTabComponent } from 'obsidian-dev-utils/obsidian/components/plugin-settings-tab-component';
import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';
import { App as AppCls } from 'obsidian-test-mocks/obsidian';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

interface ComponentModuleActual {
  Component: new () => object;
}

interface PluginsLike {
  enabledPlugins: Set<string>;
  getPlugin: ReturnType<typeof vi.fn>;
  manifests: Record<string, unknown>;
}

interface PluginsMock {
  plugins: PluginsLike;
}

interface PluginSuggestionComponentParams {
  isSuggestionDeclined(this: void): boolean;
  setSuggestionDeclined(this: void, isDeclined: boolean): Promise<void>;
  readonly suggestedPluginId: string;
}

// Stub the plugin's OWN sibling modules (allowed test doubles). The component stub extends the real
// Test-mocks `Component` so the real `PluginBase` lifecycle can load it as a child without pulling in
// The heavy settings-base dependencies.
vi.mock('./plugin-settings-component.ts', async () => {
  const { Component } = await vi.importActual<ComponentModuleActual>('obsidian');
  const { PluginSettings } = await vi.importActual<typeof import('./plugin-settings.ts')>('./plugin-settings.ts');
  class PluginSettingsComponent extends Component {
    public settings = new PluginSettings();

    public editAndSave(settingsEditor: (settings: object) => void): Promise<void> {
      settingsEditor(this.settings);
      // eslint-disable-next-line obsidian-dev-utils/prefer-noop-async -- a hoisted vi.mock factory cannot reach a top-level import.
      return Promise.resolve();
    }
  }
  return { PluginSettingsComponent };
});

// Capture the `PluginSuggestionComponent` constructor argument so the closures the plugin hands it — the
// Declined-flag getter and setter — can be invoked directly. The stub returns a fresh real `Component` so
// The real `PluginBase` lifecycle can load it as a child without reaching the community-plugin registry.
const { pluginSuggestionStub } = vi.hoisted(() => ({
  pluginSuggestionStub: vi.fn<(params: PluginSuggestionComponentParams) => object>()
}));

vi.mock('obsidian-dev-utils/obsidian/components/plugin-suggestion-component', async (importOriginal) => {
  const actual = await importOriginal<typeof import('obsidian-dev-utils/obsidian/components/plugin-suggestion-component')>();
  const { Component } = await vi.importActual<ComponentModuleActual>('obsidian');
  // eslint-disable-next-line prefer-arrow-callback -- a vi.fn used with `new` must be a non-arrow function returning a fresh real Component.
  pluginSuggestionStub.mockImplementation(function NamedStub() {
    return new Component();
  });
  return {
    ...actual,
    PluginSuggestionComponent: pluginSuggestionStub
  };
});

vi.mock('./plugin-settings-tab.ts', () => ({
  PluginSettingsTab: vi.fn()
}));

vi.mock('./frontmatter-markdown-links-component.ts', async () => {
  const { Component } = await vi.importActual<ComponentModuleActual>('obsidian');
  class FrontmatterMarkdownLinksComponent extends Component {}
  return { FrontmatterMarkdownLinksComponent };
});

vi.mock('./rename-delete-handler-migration-component.ts', async () => {
  const { Component } = await vi.importActual<ComponentModuleActual>('obsidian');
  class RenameDeleteHandlerMigrationComponent extends Component {}
  return { RenameDeleteHandlerMigrationComponent };
});

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { PluginSettingsComponent } from './plugin-settings-component.ts';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { Plugin } from './plugin.ts';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { RenameDeleteHandlerMigrationComponent } from './rename-delete-handler-migration-component.ts';

const PLUGIN_MANIFEST: PluginManifest = {
  author: 'test',
  description: 'test',
  id: 'frontmatter-markdown-links',
  minAppVersion: '1.0.0',
  name: 'Frontmatter Markdown Links',
  version: '1.0.0'
};

function createConfiguredApp(): App {
  const appMock = AppCls.createConfigured__();
  appMock.workspace.onLayoutReady = vi.fn((callback: () => void) => {
    callback();
  });
  // The strict App mock throws on an unmocked member, so `plugins` is assigned wholesale before use. The
  // Suggestion component reads the registry on layout-ready to decide whether there is anything to suggest.
  castTo<PluginsMock>(appMock).plugins = {
    enabledPlugins: new Set<string>(),
    getPlugin: vi.fn().mockReturnValue(null),
    manifests: {}
  };
  return appMock.asOriginalType__();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Plugin', () => {
  it('should add the plugin\'s own sibling child components during onload', async () => {
    const plugin = new Plugin(createConfiguredApp(), PLUGIN_MANIFEST);
    const addChildSpy = vi.spyOn(plugin, 'addChild');

    await plugin.onload();

    const addedChildren = addChildSpy.mock.calls.map((call) => call[0]);
    expect(addedChildren.some((child) => child instanceof PluginSettingsComponent)).toBe(true);
    expect(addedChildren.some((child) => child instanceof PluginSettingsTabComponent)).toBe(true);
    plugin.unload();
  });

  // Advanced Rename and Delete Handler owns rename/delete handling since 3.0.0. Two handlers acting on one
  // Rename corrupts links, so this plugin must register none — the inverse of what it used to assert.
  it('should not construct a rename/delete handler of its own', async () => {
    const renameDeleteHandlerModule = await import('obsidian-dev-utils/obsidian/components/rename-delete-handler-component');
    const renameDeleteHandlerSpy = vi.spyOn(renameDeleteHandlerModule, 'RenameDeleteHandlerComponent');
    const plugin = new Plugin(createConfiguredApp(), PLUGIN_MANIFEST);

    await plugin.onload();

    expect(renameDeleteHandlerSpy).not.toHaveBeenCalled();
    plugin.unload();
  });

  it('should suggest Advanced Rename and Delete Handler instead', async () => {
    const plugin = new Plugin(createConfiguredApp(), PLUGIN_MANIFEST);

    await plugin.onload();

    expect(pluginSuggestionStub).toHaveBeenCalled();
    expect(suggestionParams().suggestedPluginId).toBe('advanced-rename-and-delete-handler');
    plugin.unload();
  });

  it('should report the suggestion as not declined until the user says otherwise', async () => {
    const plugin = new Plugin(createConfiguredApp(), PLUGIN_MANIFEST);

    await plugin.onload();

    expect(suggestionParams().isSuggestionDeclined()).toBe(false);
    plugin.unload();
  });

  it('should remember a declined suggestion in its own settings', async () => {
    const plugin = new Plugin(createConfiguredApp(), PLUGIN_MANIFEST);

    await plugin.onload();
    const params = suggestionParams();
    await params.setSuggestionDeclined(true);

    expect(params.isSuggestionDeclined()).toBe(true);
    plugin.unload();
  });

  it('should offer the legacy rename setting to the new owner', async () => {
    const plugin = new Plugin(createConfiguredApp(), PLUGIN_MANIFEST);
    const addChildSpy = vi.spyOn(plugin, 'addChild');

    await plugin.onload();

    const addedChildren = addChildSpy.mock.calls.map((call) => call[0]);
    expect(addedChildren.some((child) => child instanceof RenameDeleteHandlerMigrationComponent)).toBe(true);
    plugin.unload();
  });

  it('should register the open demo vault command via its command handler', async () => {
    const plugin = new Plugin(createConfiguredApp(), PLUGIN_MANIFEST);
    const addCommandSpy = vi.spyOn(plugin, 'addCommand');

    await plugin.onload();

    expect(addCommandSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'open-demo-vault' })
    );
    plugin.unload();
  });
});

function suggestionParams(): PluginSuggestionComponentParams {
  return ensureNonNullable(pluginSuggestionStub.mock.calls[0])[0];
}

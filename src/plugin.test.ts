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

import type { MigratableSettings } from './advanced-rename-and-delete-handler.ts';

interface ComponentModuleActual {
  Component: new () => object;
}

interface PluginsLike {
  manifests: Record<string, unknown>;
}

interface PluginSuggestionComponentParams {
  isSuggestionDeclined(this: void): boolean;
  setSuggestionDeclined(this: void, isDeclined: boolean): Promise<void>;
  readonly suggestedPluginId: string;
}

interface SettingsMigrationComponentParams {
  readonly apiVersionRange: string;
  getProposedSettings(this: void): MigratableSettings | null;
  readonly providerPluginId: string;
  retireProposedSettings(this: void): Promise<void>;
  readonly sourcePluginId: string;
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

// The same treatment for the dev-utils settings-migration component. What is this plugin's own is the pair
// Of closures it hands over — which pending value is offered, and how the retirement is persisted — so they
// Are captured and invoked directly. The offer-and-retire dance around them belongs to dev-utils and is
// Tested there.
const { settingsMigrationStub } = vi.hoisted(() => ({
  settingsMigrationStub: vi.fn<(params: SettingsMigrationComponentParams) => object>()
}));

vi.mock('obsidian-dev-utils/obsidian/components/settings-migration-component', async (importOriginal) => {
  const actual = await importOriginal<typeof import('obsidian-dev-utils/obsidian/components/settings-migration-component')>();
  const { Component } = await vi.importActual<ComponentModuleActual>('obsidian');
  // eslint-disable-next-line prefer-arrow-callback -- a vi.fn used with `new` must be a non-arrow function returning a fresh real Component.
  settingsMigrationStub.mockImplementation(function NamedStub() {
    return new Component();
  });
  return {
    ...actual,
    SettingsMigrationComponent: settingsMigrationStub
  };
});

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

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { PluginSettingsComponent } from './plugin-settings-component.ts';
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

function createConfiguredApp(): App {
  const appMock = AppCls.createConfigured__();
  appMock.workspace.onLayoutReady = vi.fn((callback: () => void) => {
    callback();
  });
  // The suggestion component reads the registry on layout-ready to decide whether there is anything to
  // Suggest. obsidian-test-mocks models `getPlugin` and `enabledPlugins`, but leaves `manifests` to throw,
  // So only that one is seeded - on the real registry rather than replacing it.
  castTo<PluginsLike>(appMock.plugins).manifests = {};
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

    await plugin.onload();

    expect(settingsMigrationStub).toHaveBeenCalledOnce();
    expect(migrationParams().providerPluginId).toBe('advanced-rename-and-delete-handler');
    expect(migrationParams().sourcePluginId).toBe(PLUGIN_MANIFEST.id);
    expect(migrationParams().apiVersionRange).toBe('^1');
    plugin.unload();
  });

  it('should offer nothing while no legacy value is pending', async () => {
    const plugin = new Plugin(createConfiguredApp(), PLUGIN_MANIFEST);

    await plugin.onload();

    expect(migrationParams().getProposedSettings()).toBeNull();
    plugin.unload();
  });

  it('should offer the pending value once the settings carry one', async () => {
    const plugin = new Plugin(createConfiguredApp(), PLUGIN_MANIFEST);
    const settingsComponent = await loadAndTakeSettingsComponent(plugin);

    await setPending(settingsComponent, true);

    expect(migrationParams().getProposedSettings()).toEqual({ shouldHandleRenames: true });
    plugin.unload();
  });

  // `false` is a value the user chose, not an absent one, so it has to travel.
  it('should offer a pending value of false rather than treating it as absent', async () => {
    const plugin = new Plugin(createConfiguredApp(), PLUGIN_MANIFEST);
    const settingsComponent = await loadAndTakeSettingsComponent(plugin);

    await setPending(settingsComponent, false);

    expect(migrationParams().getProposedSettings()).toEqual({ shouldHandleRenames: false });
    plugin.unload();
  });

  // Retiring through `editAndSave` rather than `setProperty` is what makes the retirement outlive a
  // Reload; the in-memory-only variant would offer the migration again forever.
  it('should retire the pending value to disk once the migration is applied', async () => {
    const plugin = new Plugin(createConfiguredApp(), PLUGIN_MANIFEST);
    const settingsComponent = await loadAndTakeSettingsComponent(plugin);
    await setPending(settingsComponent, true);
    const editAndSaveSpy = vi.spyOn(settingsComponent, 'editAndSave');

    await migrationParams().retireProposedSettings();

    expect(editAndSaveSpy).toHaveBeenCalledOnce();
    expect(migrationParams().getProposedSettings()).toBeNull();
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

// The plugin's settings component is protected on `PluginBase`, so the instance it actually handed to the
// Migration component is taken from the children it added.
async function loadAndTakeSettingsComponent(plugin: Plugin): Promise<PluginSettingsComponent> {
  const addChildSpy = vi.spyOn(plugin, 'addChild');

  await plugin.onload();

  const settingsComponent = addChildSpy.mock.calls
    .map((call) => call[0])
    .find((child) => child instanceof PluginSettingsComponent);
  return ensureNonNullable(settingsComponent);
}

function migrationParams(): SettingsMigrationComponentParams {
  return ensureNonNullable(settingsMigrationStub.mock.calls[0])[0];
}

// The settings are read-only from the outside, so a pending value is arranged the same way the plugin
// Itself writes one.
async function setPending(settingsComponent: PluginSettingsComponent, shouldHandleRenames: boolean): Promise<void> {
  await settingsComponent.editAndSave((settings) => {
    settings.proposedShouldHandleRenames = shouldHandleRenames;
  });
}

function suggestionParams(): PluginSuggestionComponentParams {
  return ensureNonNullable(pluginSuggestionStub.mock.calls[0])[0];
}

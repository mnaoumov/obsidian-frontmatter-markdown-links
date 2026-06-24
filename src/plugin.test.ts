import type {
  App,
  PluginManifest
} from 'obsidian';
import type { RenameDeleteHandlerSettings } from 'obsidian-dev-utils/obsidian/components/rename-delete-handler-component';

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

interface FileManagerLike {
  runAsyncLinkUpdate: ReturnType<typeof vi.fn>;
}

interface FileManagerWithLinkUpdate {
  fileManager: FileManagerLike;
}

interface MutableRenameSetting {
  shouldHandleRenames: boolean;
}

interface RenameDeleteHandlerComponentParams {
  settingsBuilder(): Partial<RenameDeleteHandlerSettings>;
}

// Stub the plugin's OWN sibling modules (allowed test doubles). The component stub extends the real
// Test-mocks `Component` so the real `PluginBase` lifecycle can load it as a child without pulling in
// The heavy settings-base dependencies.
vi.mock('./plugin-settings-component.ts', async () => {
  const { Component } = await vi.importActual<ComponentModuleActual>('obsidian');
  const { PluginSettings } = await vi.importActual<typeof import('./plugin-settings.ts')>('./plugin-settings.ts');
  class PluginSettingsComponent extends Component {
    public settings = new PluginSettings();
  }
  return { PluginSettingsComponent };
});

vi.mock('./plugin-settings-tab.ts', () => ({
  PluginSettingsTab: vi.fn()
}));

vi.mock('./frontmatter-markdown-links-component.ts', async () => {
  const { Component } = await vi.importActual<ComponentModuleActual>('obsidian');
  class FrontmatterMarkdownLinksComponent extends Component {}
  return { FrontmatterMarkdownLinksComponent };
});

// Capture the `RenameDeleteHandlerComponent` constructor argument so the `settingsBuilder` closure can
// Be invoked directly. The stub returns a fresh real `Component` so the real `PluginBase` lifecycle can
// Load it as a child without driving the deep rename machinery.
const { renameDeleteHandlerStub } = vi.hoisted(() => ({
  renameDeleteHandlerStub: vi.fn<(params: RenameDeleteHandlerComponentParams) => object>()
}));

vi.mock('obsidian-dev-utils/obsidian/components/rename-delete-handler-component', async (importOriginal) => {
  const actual = await importOriginal<typeof import('obsidian-dev-utils/obsidian/components/rename-delete-handler-component')>();
  const { Component } = await vi.importActual<ComponentModuleActual>('obsidian');
  // eslint-disable-next-line prefer-arrow-callback -- a vi.fn used with `new` must be a non-arrow function returning a fresh real Component.
  renameDeleteHandlerStub.mockImplementation(function NamedStub() {
    return new Component();
  });
  return {
    ...actual,
    RenameDeleteHandlerComponent: renameDeleteHandlerStub
  };
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
  appMock.workspace.onLayoutReady = vi.fn((cb: () => void) => {
    cb();
  });
  const app = appMock.asOriginalType__();
  // The real RenameDeleteHandlerComponent's parent path monkey-patches `fileManager.runAsyncLinkUpdate`;
  // The strict FileManager mock throws on that unmocked member, so provide a thin stub for the patch to wrap.
  castTo<FileManagerWithLinkUpdate>(app).fileManager.runAsyncLinkUpdate = vi.fn();
  return app;
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

  it('should construct the rename/delete handler with a settingsBuilder reading shouldHandleRenames', async () => {
    const plugin = new Plugin(createConfiguredApp(), PLUGIN_MANIFEST);

    await plugin.onload();

    expect(renameDeleteHandlerStub).toHaveBeenCalled();
    const params = ensureNonNullable(renameDeleteHandlerStub.mock.calls[0])[0];
    expect(params.settingsBuilder()).toEqual({ shouldHandleRenames: true });
    plugin.unload();
  });

  it('should reflect a changed shouldHandleRenames setting through the settingsBuilder closure', async () => {
    const plugin = new Plugin(createConfiguredApp(), PLUGIN_MANIFEST);
    const addChildSpy = vi.spyOn(plugin, 'addChild');

    await plugin.onload();

    const addedChildren = addChildSpy.mock.calls.map((call) => call[0]);
    const pluginSettingsComponent = castTo<PluginSettingsComponent>(
      addedChildren.find((child) => child instanceof PluginSettingsComponent)
    );
    castTo<MutableRenameSetting>(pluginSettingsComponent.settings).shouldHandleRenames = false;
    const params = ensureNonNullable(renameDeleteHandlerStub.mock.calls[0])[0];
    expect(params.settingsBuilder()).toEqual({ shouldHandleRenames: false });
    plugin.unload();
  });
});

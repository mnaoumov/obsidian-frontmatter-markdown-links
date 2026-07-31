import type {
  App as AppOriginal,
  Plugin,
  SettingGroup
} from 'obsidian';
import type { PluginSettingsComponentBase } from 'obsidian-dev-utils/obsidian/components/plugin-settings-component';

import { noopAsync } from 'obsidian-dev-utils/function';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-tab';
import { SettingEx } from 'obsidian-dev-utils/obsidian/setting-ex';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { PluginSettingsTab } from './plugin-settings-tab.ts';
import { PluginSettings } from './plugin-settings.ts';

let app: AppOriginal;

beforeEach(() => {
  vi.clearAllMocks();
  app = App.createConfigured__().asOriginalType__();
  vi.spyOn(PluginSettingsTabBase.prototype, 'bind').mockImplementation((params) => params.valueComponent);
});

describe('PluginSettingsTab', () => {
  it('should declare the two expected toggle settings', () => {
    const tab = createTab();

    const declaredNames = settingNames(tab);
    expect(declaredNames).toContain('Should show initialization notice');
    expect(declaredNames).toContain('Should handle renames');
  });

  it('should set correct name for first setting', () => {
    const tab = createTab();

    expect(settingNames(tab)[0]).toBe('Should show initialization notice');
  });

  it('should set correct name for second setting', () => {
    const tab = createTab();

    expect(settingNames(tab)[1]).toBe('Should handle renames');
  });

  it('should bind shouldShowInitializationNotice via addToggle', () => {
    const tab = createTab();

    renderRows(tab);

    expect(boundKeys()).toContain('shouldShowInitializationNotice');
  });

  it('should bind shouldHandleRenames via addToggle', () => {
    const tab = createTab();

    renderRows(tab);

    expect(boundKeys()).toContain('shouldHandleRenames');
  });
});

function boundKeys(): unknown[] {
  return vi.mocked(PluginSettingsTabBase.prototype.bind).mock.calls.map((call) => call[0].propertyName);
}

function createMockSettingsComponent(): PluginSettingsComponentBase<PluginSettings> {
  return strictProxy<PluginSettingsComponentBase<PluginSettings>>({
    defaultSettings: new PluginSettings(),
    on: vi.fn().mockReturnValue({ asyncEventSource: { offref: vi.fn() } }),
    revalidate: vi.fn(() => Promise.resolve({ shouldHandleRenames: '', shouldShowInitializationNotice: '' })),
    saveToFile: vi.fn(() => noopAsync()),
    setProperty: vi.fn(() => Promise.resolve('')),
    settingsState: {
      effectiveValues: new PluginSettings(),
      inputValues: new PluginSettings(),
      validationMessages: { shouldHandleRenames: '', shouldShowInitializationNotice: '' }
    }
  });
}

function createTab(): PluginSettingsTab {
  const plugin = strictProxy<Plugin>({
    app,
    manifest: { id: 'test-plugin' }
  });
  const pluginSettingsComponent = createMockSettingsComponent();
  return new PluginSettingsTab({ plugin, pluginSettingsComponent });
}

/**
 * Invokes every declared row's `render` callback the way Obsidian does when the tab is opened, so the
 * bindings are still exercised now that the rows are declarative.
 *
 * @param tab - The settings tab.
 */
function renderRows(tab: PluginSettingsTab): void {
  for (const definition of tab.getSettingDefinitions()) {
    if ('render' in definition) {
      definition.render(new SettingEx(tab.containerEl), castTo<SettingGroup>(null));
    }
  }
}

/**
 * Reads the names of the declared rows.
 *
 * @param tab - The settings tab.
 * @returns The names.
 */
function settingNames(tab: PluginSettingsTab): string[] {
  return tab.getSettingDefinitions().map((definition) => 'name' in definition ? definition.name : '');
}

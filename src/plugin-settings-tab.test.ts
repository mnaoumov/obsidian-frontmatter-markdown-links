import type {
  App as AppOriginal,
  Plugin
} from 'obsidian';
import type { PluginSettingsComponentBase } from 'obsidian-dev-utils/obsidian/components/plugin-settings-component';

import { Setting } from 'obsidian';
import { noopAsync } from 'obsidian-dev-utils/function';
import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-tab';
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
  vi.spyOn(PluginSettingsTabBase.prototype, 'bind').mockImplementation((valueComponent) => valueComponent);
});

describe('PluginSettingsTab', () => {
  it('should create the two expected toggle settings on display', () => {
    const setNameSpy = vi.spyOn(Setting.prototype, 'setName');
    const tab = createTab();

    tab.displayLegacy();

    const renderedNames = setNameSpy.mock.calls.map((call) => call[0]);
    expect(renderedNames).toContain('Should show initialization notice');
    expect(renderedNames).toContain('Should handle renames');
  });

  it('should set correct name for first setting', () => {
    const setNameSpy = vi.spyOn(Setting.prototype, 'setName');
    const tab = createTab();

    tab.displayLegacy();

    expect(setNameSpy).toHaveBeenCalledWith('Should show initialization notice');
  });

  it('should set correct name for second setting', () => {
    const setNameSpy = vi.spyOn(Setting.prototype, 'setName');
    const tab = createTab();

    tab.displayLegacy();

    expect(setNameSpy).toHaveBeenCalledWith('Should handle renames');
  });

  it('should bind shouldShowInitializationNotice via addToggle', () => {
    const tab = createTab();

    tab.displayLegacy();

    expect(boundKeys()).toContain('shouldShowInitializationNotice');
  });

  it('should bind shouldHandleRenames via addToggle', () => {
    const tab = createTab();

    tab.displayLegacy();

    expect(boundKeys()).toContain('shouldHandleRenames');
  });
});

function boundKeys(): unknown[] {
  return vi.mocked(PluginSettingsTabBase.prototype.bind).mock.calls.map((call) => call[1]);
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

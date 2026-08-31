import type {
  App as AppOriginal,
  Plugin,
  SettingGroup
} from 'obsidian';
import type { PluginSettingsComponentBase } from 'obsidian-dev-utils/obsidian/components/plugin-settings-component';
import type { PluginSuggestionComponent } from 'obsidian-dev-utils/obsidian/components/plugin-suggestion-component';

import { noopAsync } from 'obsidian-dev-utils/function';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { SuggestedPluginState } from 'obsidian-dev-utils/obsidian/components/plugin-suggestion-component';
import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/plugin/plugin-settings-tab';
import { SettingEx } from 'obsidian-dev-utils/obsidian/setting-ex';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';
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

interface SearchableDefinition {
  searchable?: boolean;
}

interface VisibleDefinition {
  visible(): boolean;
}

let app: AppOriginal;
let getSuggestedPluginState: ReturnType<typeof vi.fn<() => SuggestedPluginState>>;
let renderBanner: ReturnType<typeof vi.fn<(containerEl: HTMLElement) => void>>;

beforeEach(() => {
  vi.clearAllMocks();
  app = App.createConfigured__().asOriginalType__();
  getSuggestedPluginState = vi.fn<() => SuggestedPluginState>(() => SuggestedPluginState.NotInstalled);
  renderBanner = vi.fn<(containerEl: HTMLElement) => void>();
  vi.spyOn(PluginSettingsTabBase.prototype, 'bind').mockImplementation((params) => params.valueComponent);
});

describe('PluginSettingsTab', () => {
  it('should declare the suggestion banner row first and the initialization toggle after it', () => {
    const tab = createTab();

    expect(settingNames(tab)).toEqual(['', 'Should show initialization notice']);
  });

  it('should keep the banner row out of the settings search', () => {
    const tab = createTab();

    expect(castTo<SearchableDefinition>(ensureNonNullable(tab.getSettingDefinitions()[0])).searchable).toBe(false);
  });

  it('should show the banner row while the suggested plugin is not enabled', () => {
    const tab = createTab();

    expect(isBannerRowVisible(tab)).toBe(true);
  });

  it('should hide the banner row once the suggested plugin is enabled', () => {
    getSuggestedPluginState.mockReturnValue(SuggestedPluginState.Enabled);
    const tab = createTab();

    expect(isBannerRowVisible(tab)).toBe(false);
  });

  it('should render the banner into an emptied row element', () => {
    const tab = createTab();
    const setting = new SettingEx(tab.containerEl);
    setting.setName('Leftover');

    renderRow(tab, 0, setting);

    expect(renderBanner).toHaveBeenCalledWith(setting.settingEl);
    expect(setting.settingEl.textContent).toBe('');
  });

  it('should bind shouldShowInitializationNotice via addToggle', () => {
    const tab = createTab();

    renderRow(tab, 1, new SettingEx(tab.containerEl));

    expect(boundKeys()).toContain('shouldShowInitializationNotice');
  });
});

function boundKeys(): unknown[] {
  return vi.mocked(PluginSettingsTabBase.prototype.bind).mock.calls.map((call) => call[0].propertyName);
}

function createMockSettingsComponent(): PluginSettingsComponentBase<PluginSettings> {
  const validationMessages = {
    isAdvancedRenameAndDeleteHandlerSuggestionDeclined: '',
    proposedShouldHandleRenames: '',
    shouldShowInitializationNotice: ''
  };
  return strictProxy<PluginSettingsComponentBase<PluginSettings>>({
    defaultSettings: new PluginSettings(),
    on: vi.fn().mockReturnValue({ asyncEventSource: { offref: vi.fn() } }),
    revalidate: vi.fn(() => Promise.resolve(validationMessages)),
    saveToFile: vi.fn(() => noopAsync()),
    setProperty: vi.fn(() => Promise.resolve('')),
    settingsState: {
      effectiveValues: new PluginSettings(),
      inputValues: new PluginSettings(),
      validationMessages
    }
  });
}

function createTab(): PluginSettingsTab {
  const plugin = strictProxy<Plugin>({
    app,
    manifest: { id: 'test-plugin' }
  });
  return new PluginSettingsTab({
    plugin,
    pluginSettingsComponent: createMockSettingsComponent(),
    pluginSuggestionComponent: strictProxy<PluginSuggestionComponent>({
      getSuggestedPluginState,
      renderBanner
    })
  });
}

/**
 * Evaluates the banner row's `visible` predicate the way Obsidian does on every render.
 *
 * @param tab - The settings tab.
 * @returns Whether the row would be rendered.
 */
function isBannerRowVisible(tab: PluginSettingsTab): boolean {
  const visible = castTo<VisibleDefinition>(ensureNonNullable(tab.getSettingDefinitions()[0])).visible;
  return visible();
}

/**
 * Invokes one declared row's `render` callback the way Obsidian does when the tab is opened, so the rows are
 * still exercised now that they are declarative.
 *
 * @param tab - The settings tab.
 * @param index - The index of the row.
 * @param setting - The setting to render into.
 */
function renderRow(tab: PluginSettingsTab, index: number, setting: SettingEx): void {
  const definition = ensureNonNullable(tab.getSettingDefinitions()[index]);
  if (!('render' in definition)) {
    throw new Error(`The setting definition at index ${String(index)} does not render.`);
  }

  definition.render(setting, castTo<SettingGroup>(null));
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

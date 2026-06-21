import type { Plugin } from 'obsidian';
import type { PluginSettingsComponentBase } from 'obsidian-dev-utils/obsidian/components/plugin-settings-component';

import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { PluginSettings } from './plugin-settings.ts';

type CallbackFn = (...args: unknown[]) => unknown;

interface MockSettingInstance {
  addToggle: ReturnType<typeof vi.fn>;
  setDesc: ReturnType<typeof vi.fn>;
  setName: ReturnType<typeof vi.fn>;
}

const settingInstances: MockSettingInstance[] = [];

vi.mock('obsidian', () => ({
  Setting: class MockSetting {
    public addToggle = vi.fn().mockImplementation(function addToggleMock(this: typeof MockSetting, cb: CallbackFn) {
      cb({ mockToggle: true });
      return this;
    });

    public setDesc = vi.fn().mockReturnThis();
    public setName = vi.fn().mockReturnThis();

    public constructor() {
      settingInstances.push(this);
    }
  }
}));

const hoisted = vi.hoisted(() => {
  const keys: string[] = [];

  class PluginSettingsTabBaseMock {
    public containerEl = activeDocument.createElement('div');

    public bind(_component: unknown, key: string): void {
      keys.push(key);
    }

    public display(): void {
      /* Base implementation */
    }
  }

  return { keys, PluginSettingsTabBaseMock };
});

vi.mock('obsidian-dev-utils/obsidian/plugin/plugin-settings-tab', () => ({
  PluginSettingsTabBase: hoisted.PluginSettingsTabBaseMock
}));

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { PluginSettingsTab } from './plugin-settings-tab.ts';

function createMockSettingsComponent(): PluginSettingsComponentBase<PluginSettings> {
  return strictProxy<PluginSettingsComponentBase<PluginSettings>>({
    defaultSettings: new PluginSettings(),
    on: vi.fn().mockReturnValue({ id: 0 }),
    settings: new PluginSettings(),
    settingsState: {
      effectiveValues: new PluginSettings(),
      inputValues: new PluginSettings(),
      validationMessages: {} as Record<string, string>
    }
  });
}

describe('PluginSettingsTab', () => {
  it('should create two toggle settings on display', () => {
    settingInstances.length = 0;

    const plugin = strictProxy<Plugin>({
      app: {
        workspace: {
          on: vi.fn().mockReturnValue({})
        }
      }
    });
    const pluginSettingsComponent = createMockSettingsComponent();
    const tab = new PluginSettingsTab({ plugin, pluginSettingsComponent });
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- PluginSettingsTab still overrides the deprecated display(); exercising it is the intent of this test.
    tab.displayLegacy();

    const EXPECTED_SETTINGS_COUNT = 2;
    expect(settingInstances).toHaveLength(EXPECTED_SETTINGS_COUNT);
  });

  it('should set correct name for first setting', () => {
    settingInstances.length = 0;

    const plugin = strictProxy<Plugin>({
      app: {
        workspace: {
          on: vi.fn().mockReturnValue({})
        }
      }
    });
    const pluginSettingsComponent = createMockSettingsComponent();
    const tab = new PluginSettingsTab({ plugin, pluginSettingsComponent });
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- PluginSettingsTab still overrides the deprecated display(); exercising it is the intent of this test.
    tab.displayLegacy();

    expect(settingInstances.at(0)?.setName).toHaveBeenCalledWith('Should show initialization notice');
  });

  it('should set correct name for second setting', () => {
    settingInstances.length = 0;

    const plugin = strictProxy<Plugin>({
      app: {
        workspace: {
          on: vi.fn().mockReturnValue({})
        }
      }
    });
    const pluginSettingsComponent = createMockSettingsComponent();
    const tab = new PluginSettingsTab({ plugin, pluginSettingsComponent });
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- PluginSettingsTab still overrides the deprecated display(); exercising it is the intent of this test.
    tab.displayLegacy();

    expect(settingInstances.at(1)?.setName).toHaveBeenCalledWith('Should handle renames');
  });

  it('should bind shouldShowInitializationNotice via addToggle', () => {
    settingInstances.length = 0;
    hoisted.keys.length = 0;

    const plugin = strictProxy<Plugin>({
      app: {
        workspace: {
          on: vi.fn().mockReturnValue({})
        }
      }
    });
    const pluginSettingsComponent = createMockSettingsComponent();
    const tab = new PluginSettingsTab({ plugin, pluginSettingsComponent });
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- PluginSettingsTab still overrides the deprecated display(); exercising it is the intent of this test.
    tab.displayLegacy();

    expect(hoisted.keys).toContain('shouldShowInitializationNotice');
  });

  it('should bind shouldHandleRenames via addToggle', () => {
    settingInstances.length = 0;
    hoisted.keys.length = 0;

    const plugin = strictProxy<Plugin>({
      app: {
        workspace: {
          on: vi.fn().mockReturnValue({})
        }
      }
    });
    const pluginSettingsComponent = createMockSettingsComponent();
    const tab = new PluginSettingsTab({ plugin, pluginSettingsComponent });
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- PluginSettingsTab still overrides the deprecated display(); exercising it is the intent of this test.
    tab.displayLegacy();

    expect(hoisted.keys).toContain('shouldHandleRenames');
  });
});

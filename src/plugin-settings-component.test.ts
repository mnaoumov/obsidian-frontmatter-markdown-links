import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

interface MockConstructorParams {
  readonly pluginSettingsClass: new () => unknown;
}

const PluginSettingsComponentBaseMock = vi.hoisted(() =>
  class {
    public readonly defaultSettings: unknown;

    public constructor(params: MockConstructorParams) {
      this.defaultSettings = new params.pluginSettingsClass();
    }
  }
);

vi.mock('obsidian-dev-utils/obsidian/components/plugin-settings-component', () => ({
  PluginSettingsComponentBase: PluginSettingsComponentBaseMock
}));

vi.mock('./plugin-settings.ts', () => ({
  PluginSettings: class MockPluginSettings {
    public shouldHandleRenames = true;
    public shouldShowInitializationNotice = true;
  }
}));

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { PluginSettingsComponent } from './plugin-settings-component.ts';

describe('PluginSettingsComponent', () => {
  it('should create default settings', () => {
    const component = new PluginSettingsComponent(strictProxy<ConstructorParameters<typeof PluginSettingsComponent>[0]>({}));
    const settings = component.defaultSettings;

    expect(settings).toBeDefined();
    expect(settings.shouldHandleRenames).toBe(true);
    expect(settings.shouldShowInitializationNotice).toBe(true);
  });
});

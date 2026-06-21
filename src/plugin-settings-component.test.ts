import type { DataHandler } from 'obsidian-dev-utils/obsidian/data-handler';
import type { PluginEventSource } from 'obsidian-dev-utils/obsidian/plugin/plugin-event-source';

import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  describe,
  expect,
  it
} from 'vitest';

import { PluginSettingsComponent } from './plugin-settings-component.ts';

describe('PluginSettingsComponent', () => {
  it('should create default settings from the PluginSettings class', () => {
    const component = new PluginSettingsComponent({
      dataHandler: strictProxy<DataHandler>({}),
      pluginEventSource: strictProxy<PluginEventSource>({})
    });
    const settings = component.defaultSettings;

    expect(settings).toBeDefined();
    expect(settings.shouldHandleRenames).toBe(true);
    expect(settings.shouldShowInitializationNotice).toBe(true);
  });
});

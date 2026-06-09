import {
  describe,
  expect,
  it
} from 'vitest';

import { PluginSettings } from './plugin-settings.ts';

describe('PluginSettings', () => {
  it('should default shouldHandleRenames to true', () => {
    const settings = new PluginSettings();

    expect(settings.shouldHandleRenames).toBe(true);
  });

  it('should default shouldShowInitializationNotice to true', () => {
    const settings = new PluginSettings();

    expect(settings.shouldShowInitializationNotice).toBe(true);
  });
});

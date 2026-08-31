import {
  describe,
  expect,
  it
} from 'vitest';

import { PluginSettings } from './plugin-settings.ts';

describe('PluginSettings', () => {
  it('should default proposedShouldHandleRenames to null', () => {
    const settings = new PluginSettings();

    expect(settings.proposedShouldHandleRenames).toBeNull();
  });

  it('should default isAdvancedRenameAndDeleteHandlerSuggestionDeclined to false', () => {
    const settings = new PluginSettings();

    expect(settings.isAdvancedRenameAndDeleteHandlerSuggestionDeclined).toBe(false);
  });

  it('should default shouldShowInitializationNotice to true', () => {
    const settings = new PluginSettings();

    expect(settings.shouldShowInitializationNotice).toBe(true);
  });
});

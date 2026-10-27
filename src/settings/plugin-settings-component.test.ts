import type { DataHandler } from '@mnaoumov/obsidian-lib/data-handler';
import type { PluginEventSource } from '@mnaoumov/obsidian-lib/plugin/plugin-event-source';
import type { GenericObject } from '@mnaoumov/typescript-lib/type-guards';

import { PluginSettingsComponentBase } from '@mnaoumov/obsidian-lib/components/plugin-settings-component';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { PluginSettingsComponent } from './plugin-settings-component.ts';

interface LegacySettingsInstance {
  readonly shouldHandleRenames: boolean;
}

interface RegisteredLegacyConverter {
  readonly converter: (record: GenericObject) => void;
  readonly legacySettingsClass: new () => LegacySettingsInstance;
}

let registeredLegacyConverters: RegisteredLegacyConverter[];

beforeEach(() => {
  vi.restoreAllMocks();
  registeredLegacyConverters = [];
  vi.spyOn(PluginSettingsComponentBase.prototype, 'registerLegacySettingsConverter').mockImplementation(
    (legacySettingsClass, converter) => {
      registeredLegacyConverters.push({
        converter: castTo<(record: GenericObject) => void>(converter),
        legacySettingsClass: castTo<new () => LegacySettingsInstance>(legacySettingsClass)
      });
    }
  );
});

describe('PluginSettingsComponent', () => {
  it('should create default settings from the PluginSettings class', () => {
    const settings = createComponent().defaultSettings;

    expect(settings).toBeDefined();
    expect(settings.proposedShouldHandleRenames).toBeNull();
    expect(settings.isAdvancedRenameAndDeleteHandlerSuggestionDeclined).toBe(false);
    expect(settings.shouldShowInitializationNotice).toBe(true);
  });

  describe('registerLegacySettingsConverters', () => {
    it('should register a single converter whose legacy class defaults shouldHandleRenames to true', () => {
      registerConverters();

      expect(registeredLegacyConverters).toHaveLength(1);
      const legacySettingsClass = ensureNonNullable(registeredLegacyConverters[0]).legacySettingsClass;
      expect(new legacySettingsClass().shouldHandleRenames).toBe(true);
    });

    it('should carry a legacy shouldHandleRenames over into proposedShouldHandleRenames', () => {
      registerConverters();
      const record: GenericObject = { shouldHandleRenames: false };

      legacyConverter()(record);

      expect(record['proposedShouldHandleRenames']).toBe(false);
    });

    it('should leave proposedShouldHandleRenames alone on a record that never had the legacy setting', () => {
      registerConverters();
      const record: GenericObject = {};

      legacyConverter()(record);

      expect(record).not.toHaveProperty('proposedShouldHandleRenames');
    });
  });
});

function createComponent(): PluginSettingsComponent {
  return new PluginSettingsComponent({
    dataHandler: strictProxy<DataHandler>({}),
    pluginEventSource: strictProxy<PluginEventSource>({})
  });
}

function legacyConverter(): (record: GenericObject) => void {
  return ensureNonNullable(registeredLegacyConverters[0]).converter;
}

// The base constructor calls `registerLegacySettingsConverters` itself, so constructing the component IS the
// registration.
function registerConverters(): void {
  createComponent();
}

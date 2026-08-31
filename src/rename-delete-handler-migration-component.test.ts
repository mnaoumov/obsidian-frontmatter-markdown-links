import type { App as AppOriginal } from 'obsidian';
import type { PluginApiRef } from 'obsidian-dev-utils/obsidian/plugin/plugin-api';

import { noopAsync } from 'obsidian-dev-utils/function';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import { App } from 'obsidian-test-mocks/obsidian';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { PluginSettingsComponent } from './plugin-settings-component.ts';

// `watchPluginApi` is a function export, so it cannot be spied on in place — the module is mocked instead,
// Keeping every other export real.
const { mockWatchPluginApi } = vi.hoisted(() => ({
  mockWatchPluginApi: vi.fn<() => PluginApiRef<WatchedApi>>()
}));

vi.mock('obsidian-dev-utils/obsidian/plugin/plugin-api', async (importOriginal) => ({
  ...await importOriginal<typeof import('obsidian-dev-utils/obsidian/plugin/plugin-api')>(),
  watchPluginApi: mockWatchPluginApi
}));

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { PluginSettings } from './plugin-settings.ts';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { RenameDeleteHandlerMigrationComponent } from './rename-delete-handler-migration-component.ts';

const SOURCE_PLUGIN_ID = 'frontmatter-markdown-links';

interface MigratableSettings {
  readonly shouldHandleRenames?: boolean;
}

interface MigrateSettingsParams {
  readonly proposedSettings: MigratableSettings;
  readonly sourcePluginId: string;
}

interface MigrateSettingsResult {
  readonly isApplied: boolean;
}

interface WatchedApi {
  migrateSettings(params: MigrateSettingsParams): Promise<MigrateSettingsResult>;
}

let app: AppOriginal;
let changeListeners: (() => void)[];
let migrateSettings: ReturnType<typeof vi.fn<(params: MigrateSettingsParams) => Promise<MigrateSettingsResult>>>;
let setProperty: ReturnType<typeof vi.fn<(propertyName: string, value: unknown) => Promise<string>>>;
let settings: PluginSettings;
let watchedApi: null | WatchedApi;

beforeEach(() => {
  vi.clearAllMocks();
  app = App.createConfigured__().asOriginalType__();
  changeListeners = [];
  settings = new PluginSettings();
  migrateSettings = vi.fn(() => Promise.resolve({ isApplied: true }));
  setProperty = vi.fn((propertyName: string, value: unknown) => {
    castTo<Record<string, unknown>>(settings)[propertyName] = value;
    return Promise.resolve('');
  });
  watchedApi = { migrateSettings };
  mockWatchPluginApi.mockImplementation(() =>
    castTo<PluginApiRef<WatchedApi>>({
      off: (_name: string, callback: () => void) => {
        changeListeners.remove(callback);
      },
      on: (_name: string, callback: () => void) => {
        changeListeners.push(callback);
      },
      get value(): null | WatchedApi {
        return watchedApi;
      }
    })
  );
});

describe('RenameDeleteHandlerMigrationComponent', () => {
  it('should not watch the provider at all when there is nothing pending', () => {
    settings.proposedShouldHandleRenames = null;

    createComponent().load();

    expect(mockWatchPluginApi).not.toHaveBeenCalled();
  });

  it('should watch the provider under the ^1 contract when a value is pending', () => {
    settings.proposedShouldHandleRenames = false;

    createComponent().load();

    expect(mockWatchPluginApi).toHaveBeenCalledWith(expect.objectContaining({
      apiVersionRange: '^1',
      pluginId: 'advanced-rename-and-delete-handler'
    }));
  });

  it('should offer the pending value to the provider', async () => {
    settings.proposedShouldHandleRenames = false;

    createComponent().load();
    await vi.waitFor(() => {
      expect(migrateSettings).toHaveBeenCalledWith({
        proposedSettings: { shouldHandleRenames: false },
        sourcePluginId: SOURCE_PLUGIN_ID
      });
    });
  });

  it('should retire the pending value once the user applies the migration', async () => {
    settings.proposedShouldHandleRenames = false;

    createComponent().load();
    await vi.waitFor(() => {
      expect(setProperty).toHaveBeenCalledWith('proposedShouldHandleRenames', null);
    });
    expect(settings.proposedShouldHandleRenames).toBeNull();
  });

  it('should keep the value pending when the user cancels', async () => {
    settings.proposedShouldHandleRenames = false;
    migrateSettings.mockResolvedValue({ isApplied: false });

    createComponent().load();
    await vi.waitFor(() => {
      expect(migrateSettings).toHaveBeenCalled();
    });
    expect(setProperty).not.toHaveBeenCalled();
    expect(settings.proposedShouldHandleRenames).toBe(false);
  });

  it('should stay quiet while the provider is unavailable', async () => {
    settings.proposedShouldHandleRenames = true;
    watchedApi = null;

    createComponent().load();
    await noopAsync();

    expect(migrateSettings).not.toHaveBeenCalled();
  });

  it('should offer the migration as soon as the provider appears', async () => {
    settings.proposedShouldHandleRenames = true;
    watchedApi = null;
    createComponent().load();

    watchedApi = { migrateSettings };
    for (const listener of changeListeners) {
      listener();
    }

    await vi.waitFor(() => {
      expect(migrateSettings).toHaveBeenCalledOnce();
    });
  });

  it('should not open a second dialog while one is already open', async () => {
    settings.proposedShouldHandleRenames = true;
    let resolveMigration: (() => void) | null = null;
    migrateSettings.mockImplementation(() =>
      new Promise((resolve) => {
        resolveMigration = (): void => {
          resolve({ isApplied: true });
        };
      })
    );

    createComponent().load();
    await vi.waitFor(() => {
      expect(migrateSettings).toHaveBeenCalledOnce();
    });
    for (const listener of changeListeners) {
      listener();
    }
    await noopAsync();

    expect(migrateSettings).toHaveBeenCalledOnce();
    castTo<() => void>(resolveMigration)();
  });

  it('should drop its change listener when it unloads', () => {
    settings.proposedShouldHandleRenames = true;
    const component = createComponent();

    component.load();
    expect(changeListeners).toHaveLength(1);
    component.unload();

    expect(changeListeners).toHaveLength(0);
  });
});

function createComponent(): RenameDeleteHandlerMigrationComponent {
  return new RenameDeleteHandlerMigrationComponent({
    app,
    pluginSettingsComponent: strictProxy<PluginSettingsComponent>({
      setProperty,
      get settings(): PluginSettings {
        return settings;
      }
    }),
    sourcePluginId: SOURCE_PLUGIN_ID
  });
}

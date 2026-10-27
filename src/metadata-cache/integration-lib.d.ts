import type { LocalDataStore } from '@mnaoumov/obsidian-lib/data-stores/local-data-store';

declare module 'obsidian-integration-testing' {
  interface Lib {
    readonly LocalDataStore: typeof LocalDataStore;
  }
}

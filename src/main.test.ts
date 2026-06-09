import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

vi.mock('./styles/main.scss', () => ({}));

vi.mock('./plugin.ts', () => ({
  // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Minimal mock class to verify the default export wiring.
  Plugin: class MockPlugin {}
}));

// eslint-disable-next-line import-x/first, import-x/imports-first, import-x/no-rename-default -- vi.mock must precede imports; the default is imported under an alias to assert it equals the named Plugin export.
import PluginDefault from './main.ts';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { Plugin } from './plugin.ts';

describe('main', () => {
  it('should export Plugin as default export', () => {
    expect(PluginDefault).toBe(Plugin);
  });
});

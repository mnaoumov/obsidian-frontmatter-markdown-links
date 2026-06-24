import type { App } from 'obsidian';

import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  App as AppCls,
  MarkdownView,
  WorkspaceLeaf
} from 'obsidian-test-mocks/obsidian';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { isSourceMode } from './source-mode.ts';

function createMarkdownView(): MarkdownView {
  const app = AppCls.createConfigured__();
  const leaf = WorkspaceLeaf.create2__(app);
  return new MarkdownView(leaf);
}

describe('isSourceMode', () => {
  it('should return false when there is no active MarkdownView', () => {
    const app = strictProxy<App>({
      workspace: {
        getActiveViewOfType: vi.fn().mockReturnValue(null)
      }
    });

    expect(isSourceMode(app)).toBe(false);
  });

  it('should return false when view mode is not source', () => {
    const view = createMarkdownView();
    vi.spyOn(view, 'getMode').mockReturnValue('preview');

    const app = strictProxy<App>({
      workspace: {
        getActiveViewOfType: vi.fn().mockReturnValue(view)
      }
    });

    expect(isSourceMode(app)).toBe(false);
  });

  it('should return false when view mode is source but state.source is falsy', () => {
    const view = createMarkdownView();
    vi.spyOn(view, 'getMode').mockReturnValue('source');
    vi.spyOn(view, 'getState').mockReturnValue({ source: false });

    const app = strictProxy<App>({
      workspace: {
        getActiveViewOfType: vi.fn().mockReturnValue(view)
      }
    });

    expect(isSourceMode(app)).toBe(false);
  });

  it('should return true when view mode is source and state.source is truthy', () => {
    const view = createMarkdownView();
    vi.spyOn(view, 'getMode').mockReturnValue('source');
    vi.spyOn(view, 'getState').mockReturnValue({ source: true });

    const app = strictProxy<App>({
      workspace: {
        getActiveViewOfType: vi.fn().mockReturnValue(view)
      }
    });

    expect(isSourceMode(app)).toBe(true);
  });
});

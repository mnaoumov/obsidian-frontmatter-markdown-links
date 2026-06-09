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

import {
  extractDisplayText,
  isSourceMode
} from './utils.ts';

function createMarkdownView(): MarkdownView {
  const app = AppCls.createConfigured__();
  const leaf = WorkspaceLeaf.create2__(app);
  return new MarkdownView(leaf);
}

describe('extractDisplayText', () => {
  it('should return alias when present', () => {
    const result = extractDisplayText({ alias: 'My Alias', url: 'some/path' } as Parameters<typeof extractDisplayText>[0]);

    expect(result).toBe('My Alias');
  });

  it('should return url without # when no subpath', () => {
    const result = extractDisplayText({ url: 'some/path' } as Parameters<typeof extractDisplayText>[0]);

    expect(result).toBe('some/path');
  });

  it('should convert # to > separator when url has subpath', () => {
    const result = extractDisplayText({ url: 'some/path#heading' } as Parameters<typeof extractDisplayText>[0]);

    expect(result).toBe('some/path > heading');
  });

  it('should trim whitespace around # parts', () => {
    const result = extractDisplayText({ url: ' some/path # heading ' } as Parameters<typeof extractDisplayText>[0]);

    expect(result).toBe('some/path > heading');
  });

  it('should handle multiple # parts', () => {
    const result = extractDisplayText({ url: 'path#h1#h2' } as Parameters<typeof extractDisplayText>[0]);

    expect(result).toBe('path > h1 > h2');
  });
});

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

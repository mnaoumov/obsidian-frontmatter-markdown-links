import {
  describe,
  expect,
  it
} from 'vitest';

import { extractDisplayText } from './parse-link-result.ts';

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

import type { BasesNote } from '@obsidian-typings/obsidian-public-latest';
import type { App } from 'obsidian';

import { castTo } from 'obsidian-dev-utils/object-utils';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { LinkFixer } from '../link-fixer.ts';
import { BasesNoteGetPatchComponent } from './bases-note-get-patch-component.ts';

interface ComponentModuleActual {
  Component: new () => object;
}

// Stub the plugin's own sibling child components so note-get's coverage is isolated.
vi.mock('./bases-external-link-render-to-patch-component.ts', async () => ({
  BasesExternalLinkRenderToPatchComponent: class extends (await vi.importActual<ComponentModuleActual>('obsidian')).Component {}
}));

vi.mock('./bases-list-render-to-patch-component.ts', async () => ({
  BasesListRenderToPatchComponent: class extends (await vi.importActual<ComponentModuleActual>('obsidian')).Component {}
}));

vi.mock('./string-value-render-to-patch-component.ts', async () => ({
  StringValueRenderToPatchComponent: class extends (await vi.importActual<ComponentModuleActual>('obsidian')).Component {}
}));

interface BasesNoteData {
  data: Record<string, unknown>;
}

type GetFn = (this: BasesNoteData, key: string) => unknown;

interface GetProto {
  get: GetFn;
}

let loadedComponent: BasesNoteGetPatchComponent | null = null;

afterEach(() => {
  loadedComponent?.unload();
  loadedComponent = null;
  vi.restoreAllMocks();
});

function loadPatch(proto: GetProto, linkFixer: LinkFixer): void {
  const basesNote = castTo<BasesNote>(Object.create(proto));
  const component = new BasesNoteGetPatchComponent({
    app: strictProxy<App>({}),
    basesNote,
    linkFixer
  });
  component.load();
  loadedComponent = component;
}

describe('BasesNoteGetPatchComponent', () => {
  it('should patch the child renderTo prototypes on first access and restore the value', () => {
    const seenValues: unknown[] = [];
    const originalGet = vi.fn(function getImpl(this: BasesNoteData, key: string): unknown {
      seenValues.push(this.data[key]);
      return this.data[key];
    });
    const proto = { get: originalGet };
    const linkFixer = new LinkFixer();
    const patchLinkSpy = vi.spyOn(linkFixer, 'patchLink');
    loadPatch(proto, linkFixer);

    const originalThis: BasesNoteData = { data: { key: '[Example](https://example.com)' } };
    const result = castTo<GetFn>(proto.get).call(originalThis, 'key');

    // The final fallback returns the patched value.
    expect(result).toBe(patchLinkSpy.mock.results[0]?.value);
    // The original value is restored after all temporary mutations.
    expect(originalThis.data['key']).toBe('[Example](https://example.com)');
    // First call triggers four fallbacks: external-link probe, list probe, string probe, final get.
    expect(originalGet).toHaveBeenCalledTimes(4);
    // The three probes saw the sentinel/probe values.
    expect(seenValues[0]).toBe('https://EXTERNAL_LINK_PREFIX.com/');
    expect(seenValues[1]).toEqual(['https://EXTERNAL_LINK_PREFIX.com/']);
    expect(seenValues[2]).toBe('text');
  });

  it('should not re-patch the child prototypes on subsequent access', () => {
    const originalGet = vi.fn(function getImpl(this: BasesNoteData, key: string): unknown {
      return this.data[key];
    });
    const proto = { get: originalGet };
    const linkFixer = new LinkFixer();
    loadPatch(proto, linkFixer);

    const originalThis: BasesNoteData = { data: { key: 'plain' } };

    castTo<GetFn>(proto.get).call(originalThis, 'key');
    expect(originalGet).toHaveBeenCalledTimes(4);

    originalGet.mockClear();
    const result = castTo<GetFn>(proto.get).call(originalThis, 'key');

    // Subsequent access skips the patching branch: only the final fallback runs.
    expect(originalGet).toHaveBeenCalledTimes(1);
    expect(result).toBe('plain');
    expect(originalThis.data['key']).toBe('plain');
  });

  it('should restore the value even when the final fallback throws', () => {
    const error = new Error('boom');
    let callCount = 0;
    const originalGet = vi.fn(function getImpl(this: BasesNoteData, key: string): unknown {
      callCount++;
      // The first three calls are the child-patching probes; the fourth is the final get.
      if (callCount === 4) {
        throw error;
      }
      return this.data[key];
    });
    const proto = { get: originalGet };
    const linkFixer = new LinkFixer();
    loadPatch(proto, linkFixer);

    const originalThis: BasesNoteData = { data: { key: 'plain' } };

    expect(() => castTo<GetFn>(proto.get).call(originalThis, 'key')).toThrow(error);
    // The finally block restores the original value despite the throw.
    expect(originalThis.data['key']).toBe('plain');
  });
});

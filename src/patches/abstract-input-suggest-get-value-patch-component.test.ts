import { AbstractInputSuggest } from 'obsidian';
import { noop } from 'obsidian-dev-utils/function';
import { castTo } from 'obsidian-dev-utils/object-utils';
import { App as AppCls } from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { PatchedInputElementMap } from '../patched-input-element-map.ts';

interface ObsidianComponentModule {
  Component: new () => object;
}

// Stub the sibling patch component so this test isolates the get-value patch's
// Own coverage. The real one installs another prototype patch as a side effect.
vi.mock('./abstract-input-suggest-select-suggestion-patch-component.ts', async () => {
  const { Component: ComponentCls } = await vi.importActual<ObsidianComponentModule>('obsidian');
  return {
    AbstractInputSuggestSelectSuggestionPatchComponent: class extends ComponentCls {}
  };
});

// eslint-disable-next-line import-x/first, import-x/imports-first -- The mock above must precede this import.
import { AbstractInputSuggestGetValuePatchComponent } from './abstract-input-suggest-get-value-patch-component.ts';

type GetValueFn = (this: unknown) => string;

class TestSuggest extends AbstractInputSuggest<unknown> {
  public override getSuggestions(): unknown[] {
    return [];
  }

  public override renderSuggestion(): void {
    noop();
  }

  public override selectSuggestion(): void {
    noop();
  }
}

let loadedComponent: AbstractInputSuggestGetValuePatchComponent | null = null;

afterEach(() => {
  loadedComponent?.unload();
  loadedComponent = null;
  vi.restoreAllMocks();
});

function callGetValue(suggest: TestSuggest): string {
  return castTo<GetValueFn>(AbstractInputSuggest.prototype.getValue).call(suggest);
}

function createSuggest(textInputEl: HTMLDivElement): TestSuggest {
  const app = AppCls.createConfigured__().asOriginalType__();
  return castTo<TestSuggest>(new TestSuggest(app, textInputEl));
}

function loadPatch(patchedInputElementMap: PatchedInputElementMap): void {
  const component = new AbstractInputSuggestGetValuePatchComponent({ patchedInputElementMap });
  component.load();
  loadedComponent = component;
}

function setCaretOffset(offset: null | number): void {
  if (offset === null) {
    vi.spyOn(activeWindow, 'getSelection').mockReturnValue(null);
    return;
  }
  vi.spyOn(activeWindow, 'getSelection').mockReturnValue(castTo<Selection>({
    getRangeAt: () => castTo<Range>({ startOffset: offset }),
    rangeCount: 1
  }));
}

describe('AbstractInputSuggestGetValuePatchComponent', () => {
  it('should return the original value when the input element is not patched', () => {
    const textInputEl = activeDocument.createElement('div');
    textInputEl.textContent = 'Unpatched value';
    const suggest = createSuggest(textInputEl);
    loadPatch(new PatchedInputElementMap());

    const result = callGetValue(suggest);

    expect(result).toBe('Unpatched value');
  });

  it('should add the select-suggestion patch child only once across multiple calls', () => {
    const textInputEl = activeDocument.createElement('div');
    textInputEl.textContent = 'Value';
    const suggest = createSuggest(textInputEl);
    loadPatch(new PatchedInputElementMap());
    const addChildSpy = vi.spyOn(castTo<AbstractInputSuggestGetValuePatchComponent>(loadedComponent), 'addChild');

    callGetValue(suggest);
    callGetValue(suggest);

    expect(addChildSpy).toHaveBeenCalledTimes(1);
  });

  it('should slice the value to the open-bracket region when the input element is patched', () => {
    const textInputEl = activeDocument.createElement('div');
    textInputEl.textContent = 'Foo [[bar';
    const suggest = createSuggest(textInputEl);
    const patchedInputElementMap = new PatchedInputElementMap();
    patchedInputElementMap.setOffset(textInputEl, { from: 0, to: 0 });
    loadPatch(patchedInputElementMap);
    setCaretOffset(9);

    const result = callGetValue(suggest);

    expect(result).toBe('[[bar');
    expect(patchedInputElementMap.getOffset(textInputEl)).toEqual({ from: 4, to: 9 });
  });

  it('should return the full value when there is no open bracket before the caret', () => {
    const textInputEl = activeDocument.createElement('div');
    textInputEl.textContent = 'Plain value';
    const suggest = createSuggest(textInputEl);
    const patchedInputElementMap = new PatchedInputElementMap();
    patchedInputElementMap.setOffset(textInputEl, { from: 0, to: 0 });
    loadPatch(patchedInputElementMap);
    setCaretOffset(5);

    const result = callGetValue(suggest);

    expect(result).toBe('Plain value');
  });

  it('should return the full value when a close bracket follows the open bracket before the caret', () => {
    const textInputEl = activeDocument.createElement('div');
    textInputEl.textContent = '[[done]] more';
    const suggest = createSuggest(textInputEl);
    const patchedInputElementMap = new PatchedInputElementMap();
    patchedInputElementMap.setOffset(textInputEl, { from: 0, to: 0 });
    loadPatch(patchedInputElementMap);
    setCaretOffset(13);

    const result = callGetValue(suggest);

    expect(result).toBe('[[done]] more');
  });

  it('should treat the caret offset as zero when there is no selection', () => {
    const textInputEl = activeDocument.createElement('div');
    textInputEl.textContent = '[[bar';
    const suggest = createSuggest(textInputEl);
    const patchedInputElementMap = new PatchedInputElementMap();
    patchedInputElementMap.setOffset(textInputEl, { from: 0, to: 0 });
    loadPatch(patchedInputElementMap);
    setCaretOffset(null);

    const result = callGetValue(suggest);

    // CaretOffset 0 means valueBeforeCaret is empty, so no open bracket is found.
    expect(result).toBe('[[bar');
  });
});

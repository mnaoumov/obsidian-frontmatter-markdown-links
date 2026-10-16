import type {
  PropertyValueSuggest,
  PropertyValueSuggestTextItem
} from '@obsidian-typings/obsidian-public-latest';

import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { AbstractInputSuggest } from 'obsidian';
import { App as AppCls } from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { PatchedInputElementMap } from '../patched-input-element-map.ts';
import { AbstractInputSuggestSelectSuggestionPatchComponent } from './abstract-input-suggest-select-suggestion-patch-component.ts';

type SelectSuggestionFunction = (this: unknown, value: null | PropertyValueSuggestTextItem, $event: KeyboardEvent | MouseEvent) => unknown;

interface SuggestPrototypeWithSelect {
  selectSuggestion: SelectSuggestionFunction;
}

// Minimal concrete subclass so the abstract base can be instantiated and the
// prototype-level `selectSuggestion` can be patched and invoked.
class TestSuggest extends AbstractInputSuggest<PropertyValueSuggestTextItem> {
  public lastSelectedValue: null | PropertyValueSuggestTextItem = null;

  public override getSuggestions(): PropertyValueSuggestTextItem[] {
    return [];
  }

  public override renderSuggestion(value: PropertyValueSuggestTextItem, el: HTMLElement): void {
    el.textContent = value.text;
  }

  public override selectSuggestion(value: null | PropertyValueSuggestTextItem): void {
    this.lastSelectedValue = value;
    this.textInputEl.textContent = value?.text ?? '';
  }
}

let loadedComponent: AbstractInputSuggestSelectSuggestionPatchComponent | null = null;

afterEach(() => {
  loadedComponent?.unload();
  loadedComponent = null;
  vi.restoreAllMocks();
});

function callSelectSuggestion(suggest: TestSuggest, value: null | PropertyValueSuggestTextItem, $event: KeyboardEvent | MouseEvent): void {
  const prototype = Object.getPrototypeOf(suggest) as SuggestPrototypeWithSelect;
  prototype.selectSuggestion.call(suggest, value, $event);
}

function createSuggest(textInputEl: HTMLDivElement): TestSuggest {
  const app = AppCls.createConfigured__().asOriginalType__();
  return castTo<TestSuggest>(new TestSuggest(app, textInputEl));
}

function loadPatch(suggest: TestSuggest, patchedInputElementMap: PatchedInputElementMap): void {
  const component = new AbstractInputSuggestSelectSuggestionPatchComponent({
    abstractInputSuggest: castTo<PropertyValueSuggest>(suggest),
    patchedInputElementMap
  });
  component.load();
  loadedComponent = component;
}

describe('AbstractInputSuggestSelectSuggestionPatchComponent', () => {
  it('should delegate to the fallback when the input element is not patched', () => {
    const textInputEl = createDiv();
    const suggest = createSuggest(textInputEl);
    const patchedInputElementMap = new PatchedInputElementMap();
    loadPatch(suggest, patchedInputElementMap);

    const value = createSearchResult('chosen');
    const $event = new MouseEvent('click');
    callSelectSuggestion(suggest, value, $event);

    expect(suggest.lastSelectedValue).toBe(value);
    expect(textInputEl.textContent).toBe('chosen');
  });

  it('should splice the selected value into the original text when the input element is patched', () => {
    const textInputEl = createDiv();
    textInputEl.textContent = 'Foo [[bar';
    const suggest = createSuggest(textInputEl);
    const patchedInputElementMap = new PatchedInputElementMap();
    patchedInputElementMap.setOffset(textInputEl, { from: 4, to: 9 });
    loadPatch(suggest, patchedInputElementMap);

    const value = createSearchResult('[[bar|Bar]]');
    const $event = new MouseEvent('click');
    callSelectSuggestion(suggest, value, $event);

    // The final value should splice: oldValue.slice(0, 4) + newValue + oldValue.slice(9).
    expect(suggest.lastSelectedValue?.text).toBe('Foo [[bar|Bar]]');
    expect(suggest.lastSelectedValue?.type).toBe('text');
    // The offset should be reset to a zero range after splicing.
    expect(patchedInputElementMap.getOffset(textInputEl)).toEqual({ from: 0, to: 0 });
  });

  it('should pass a complete text item when the patched input element selects no suggestion', () => {
    const textInputEl = createDiv();
    textInputEl.textContent = 'Foo [[bar';
    const suggest = createSuggest(textInputEl);
    const patchedInputElementMap = new PatchedInputElementMap();
    patchedInputElementMap.setOffset(textInputEl, { from: 4, to: 9 });
    loadPatch(suggest, patchedInputElementMap);

    callSelectSuggestion(suggest, null, new MouseEvent('click'));

    expect(suggest.lastSelectedValue).toEqual({
      matches: null,
      score: 0,
      text: 'Foo ',
      type: 'text'
    });
  });
});

function createSearchResult(text: string): PropertyValueSuggestTextItem {
  return {
    matches: null,
    score: 0,
    text,
    type: 'text'
  };
}

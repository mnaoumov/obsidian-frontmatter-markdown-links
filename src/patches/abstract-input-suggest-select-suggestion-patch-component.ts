import type {
  AbstractInputSuggest,
  SearchResult
} from 'obsidian';

import { getPrototypeOf } from 'obsidian-dev-utils/object-utils';
import { MonkeyAroundComponent } from 'obsidian-dev-utils/obsidian/components/monkey-around-component';
import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';

import type { PatchedInputElementMap } from '../patched-input-element-map.ts';

export interface MySearchResult extends SearchResult {
  readonly text: string;
  readonly type: string;
}

interface AbstractInputSuggestSelectSuggestionPatchComponentConstructorParams {
  readonly abstractInputSuggest: AbstractInputSuggest<MySearchResult>;
  readonly patchedInputElementMap: PatchedInputElementMap;
}

export class AbstractInputSuggestSelectSuggestionPatchComponent extends MonkeyAroundComponent {
  private readonly abstractInputSuggest: AbstractInputSuggest<MySearchResult>;
  private readonly patchedInputElementMap: PatchedInputElementMap;

  public constructor(params: AbstractInputSuggestSelectSuggestionPatchComponentConstructorParams) {
    super();
    this.abstractInputSuggest = params.abstractInputSuggest;
    this.patchedInputElementMap = params.patchedInputElementMap;
  }

  public override onload(): void {
    this.registerMethodPatch({
      methodName: 'selectSuggestion',
      obj: getPrototypeOf(this.abstractInputSuggest),
      patchHandler: ({
        fallback,
        originalArgs: [value, evt],
        originalMethodBound,
        originalThis
      }) => {
        if (!this.patchedInputElementMap.has(originalThis.textInputEl)) {
          fallback();
          return;
        }

        const oldValue = originalThis.textInputEl.textContent;
        fallback();
        const newValue = originalThis.textInputEl.textContent;
        const { from, to } = ensureNonNullable(this.patchedInputElementMap.getOffset(originalThis.textInputEl));
        this.patchedInputElementMap.setOffset(originalThis.textInputEl, { from: 0, to: 0 });

        const fixedValue = oldValue.slice(0, from) + newValue + oldValue.slice(to);
        originalMethodBound({
          ...value,
          text: fixedValue,
          type: 'text'
        }, evt);
      }
    });
  }
}

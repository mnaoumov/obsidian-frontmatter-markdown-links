import type { PropertyValueSuggest } from '@obsidian-typings/obsidian-public-latest';

import { getPrototypeOf } from 'obsidian-dev-utils/object-utils';
import { MonkeyAroundComponent } from 'obsidian-dev-utils/obsidian/components/monkey-around-component';
import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';

import type { PatchedInputElementMap } from '../patched-input-element-map.ts';

interface AbstractInputSuggestSelectSuggestionPatchComponentConstructorParams {
  readonly abstractInputSuggest: PropertyValueSuggest;
  readonly patchedInputElementMap: PatchedInputElementMap;
}

export class AbstractInputSuggestSelectSuggestionPatchComponent extends MonkeyAroundComponent {
  private readonly abstractInputSuggest: PropertyValueSuggest;
  private readonly patchedInputElementMap: PatchedInputElementMap;

  public constructor(params: AbstractInputSuggestSelectSuggestionPatchComponentConstructorParams) {
    super();
    this.abstractInputSuggest = params.abstractInputSuggest;
    this.patchedInputElementMap = params.patchedInputElementMap;
  }

  public override onload(): void {
    this.registerMethodPatch({
      $object: getPrototypeOf(this.abstractInputSuggest),
      methodName: 'selectSuggestion',
      patchHandler: ({
        fallback,
        originalArguments: [value, $event],
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
          matches: null,
          score: 0,
          ...value,
          text: fixedValue,
          type: 'text'
        }, $event);
      }
    });
  }
}

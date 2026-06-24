import { AbstractInputSuggest } from 'obsidian';
import { MonkeyAroundComponent } from 'obsidian-dev-utils/obsidian/components/monkey-around-component';

import type { PatchedInputElementMap } from '../patched-input-element-map.ts';
import type { MySearchResult } from './abstract-input-suggest-select-suggestion-patch-component.ts';

import { getCaretCharacterOffset } from '../selection.ts';
import { AbstractInputSuggestSelectSuggestionPatchComponent } from './abstract-input-suggest-select-suggestion-patch-component.ts';

interface AbstractInputSuggestGetValuePatchComponentConstructorParams {
  readonly patchedInputElementMap: PatchedInputElementMap;
}
export class AbstractInputSuggestGetValuePatchComponent extends MonkeyAroundComponent {
  private isCustomAbstractInputSuggestPatched = false;
  private readonly patchedInputElementMap: PatchedInputElementMap;

  public constructor(params: AbstractInputSuggestGetValuePatchComponentConstructorParams) {
    super();
    this.patchedInputElementMap = params.patchedInputElementMap;
  }

  public override onload(): void {
    this.registerMethodPatch({
      methodName: 'getValue',
      obj: AbstractInputSuggest.prototype,
      patchHandler: ({
        fallback,
        originalThis
      }) => {
        if (!this.isCustomAbstractInputSuggestPatched) {
          this.addChild(
            new AbstractInputSuggestSelectSuggestionPatchComponent({
              abstractInputSuggest: originalThis as AbstractInputSuggest<MySearchResult>,
              patchedInputElementMap: this.patchedInputElementMap
            })
          );

          this.isCustomAbstractInputSuggestPatched = true;
        }

        const value = fallback();
        if (!this.patchedInputElementMap.has(originalThis.textInputEl)) {
          return value;
        }
        const caretOffset = getCaretCharacterOffset();
        const valueBeforeCaret = value.slice(0, caretOffset);
        const openBracketBeforeCaretIndex = valueBeforeCaret.lastIndexOf('[[');
        const closeBracketBeforeCaretIndex = valueBeforeCaret.lastIndexOf(']]');

        if (openBracketBeforeCaretIndex < 0 || openBracketBeforeCaretIndex < closeBracketBeforeCaretIndex) {
          return value;
        }

        this.patchedInputElementMap.setOffset(originalThis.textInputEl, { from: openBracketBeforeCaretIndex, to: caretOffset });
        return value.slice(openBracketBeforeCaretIndex, caretOffset);
      }
    });
  }
}

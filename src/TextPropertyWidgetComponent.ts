import type { SearchResult } from 'obsidian';
import type { ParseLinkResult } from 'obsidian-dev-utils/obsidian/Link';
import type {
  MetadataTypeManagerRegisteredTypeWidgetsRecord,
  PropertyEntryData,
  PropertyRenderContext,
  TextPropertyWidgetComponent
} from 'obsidian-typings';

import { AbstractInputSuggest } from 'obsidian';
import { getPrototypeOf } from 'obsidian-dev-utils/ObjectUtils';
import {
  parseLink,
  parseLinks
} from 'obsidian-dev-utils/obsidian/Link';
import { registerPatch } from 'obsidian-dev-utils/obsidian/MonkeyAround';

import type { Plugin } from './Plugin.ts';

type GetValueFn = AbstractInputSuggest<MySearchResult>['getValue'];
type RenderTextPropertyWidgetComponentFn = MetadataTypeManagerRegisteredTypeWidgetsRecord['text']['render'];
type SelectSuggestionFn = AbstractInputSuggest<MySearchResult>['selectSuggestion'];

let isTextPropertyWidgetComponentPatched = false;

interface MySearchResult extends SearchResult {
  text: string;
  type: string;
}

interface Offset {
  from: number;
  to: number;
}

const patchedInputEls = new WeakMap<HTMLDivElement, Offset>();

export function patchTextPropertyWidgetComponent(plugin: Plugin): void {
  const widget = plugin.app.metadataTypeManager.registeredTypeWidgets.text;

  registerPatch(plugin, widget, {
    render: (next: RenderTextPropertyWidgetComponentFn): RenderTextPropertyWidgetComponentFn => (el, value, ctx) => renderWidget(el, value, ctx, next, plugin)
  });

  registerPatch(plugin, AbstractInputSuggest.prototype, {
    getValue: (next: GetValueFn): GetValueFn => {
      return function getValuePatched(this: AbstractInputSuggest<MySearchResult>): string {
        return getValue(next, this, plugin);
      };
    }
  });
}

let isCustomAbstractInputSuggestPatched = false;

function getCaretCharacterOffset(): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) {
    return 0;
  }
  const range = sel.getRangeAt(0);
  return range.startOffset;
}

function getDisplayText(textPropertyComponent: TextPropertyWidgetComponent): string {
  const parseLinkResult = getParseLinkResult(textPropertyComponent);
  return parseLinkResult?.alias ?? parseLinkResult?.url ?? textPropertyComponent.value;
}

function getLinkText(textPropertyComponent: TextPropertyWidgetComponent): string {
  const parseLinkResult = getParseLinkResult(textPropertyComponent);
  return parseLinkResult?.url ?? textPropertyComponent.value;
}

function getParseLinkResult(textPropertyComponent: TextPropertyWidgetComponent, useValue = false): null | ParseLinkResult {
  const text = useValue ? textPropertyComponent.value : textPropertyComponent.inputEl.textContent;
  return parseLink(text ?? '');
}

function getValue(next: GetValueFn, suggest: AbstractInputSuggest<MySearchResult>, plugin: Plugin): string {
  if (!isCustomAbstractInputSuggestPatched) {
    const customAbstractInputSuggestProto = getPrototypeOf(suggest);
    registerPatch(plugin, customAbstractInputSuggestProto, {
      selectSuggestion: (nextSelectSuggestion: SelectSuggestionFn): SelectSuggestionFn => {
        return function selectSuggestionPatched(this: AbstractInputSuggest<MySearchResult>, value: MySearchResult, evt: KeyboardEvent | MouseEvent): void {
          selectSuggestion(nextSelectSuggestion, this, value, evt);
        };
      }
    });
    isCustomAbstractInputSuggestPatched = true;
  }

  const value = next.call(suggest);
  if (!patchedInputEls.has(suggest.textInputEl)) {
    return value;
  }
  const caretOffset = getCaretCharacterOffset();
  const valueBeforeCaret = value.slice(0, caretOffset);
  const openBracketBeforeCaretIndex = valueBeforeCaret.lastIndexOf('[[');
  const closeBracketBeforeCaretIndex = valueBeforeCaret.lastIndexOf(']]');

  if (openBracketBeforeCaretIndex < 0 || openBracketBeforeCaretIndex < closeBracketBeforeCaretIndex) {
    return value;
  }

  patchedInputEls.set(suggest.textInputEl, { from: openBracketBeforeCaretIndex, to: caretOffset });
  return value.slice(openBracketBeforeCaretIndex, caretOffset);
}

function isPropertyEntryData(data: null | PropertyEntryData<null | string> | string): data is PropertyEntryData<null | string> {
  return (data as null | Partial<PropertyEntryData<null | string>>)?.value !== undefined;
}

function isWikilink(textPropertyComponent: TextPropertyWidgetComponent): boolean {
  const parseLinkResult = getParseLinkResult(textPropertyComponent);
  return !!parseLinkResult && (parseLinkResult.isWikilink || !parseLinkResult.isExternal);
}

function modifyData(data: null | PropertyEntryData<null | string> | string, newValue: null | string): null | PropertyEntryData<null | string> | string {
  if (isPropertyEntryData(data)) {
    return { ...data, value: newValue };
  }

  return newValue;
}

function render(textPropertyComponent: TextPropertyWidgetComponent, next: () => void): void {
  const parseLinkResult = getParseLinkResult(textPropertyComponent, true);
  if (parseLinkResult?.isExternal) {
    textPropertyComponent.value = parseLinkResult.encodedUrl ?? parseLinkResult.url;
  }
  next.call(textPropertyComponent);
}

function renderTextPropertyWidgetComponent(
  next: RenderTextPropertyWidgetComponentFn,
  el: HTMLElement,
  data: null | PropertyEntryData<null | string> | string,
  ctx: PropertyRenderContext
): TextPropertyWidgetComponent {
  if (isPropertyEntryData(data)) {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return next(el, data as PropertyEntryData<string>, ctx);
  }

  return next(el, data, ctx);
}

function renderWidget(
  el: HTMLElement,
  data: null | PropertyEntryData<null | string> | string,
  ctx: PropertyRenderContext,
  next: RenderTextPropertyWidgetComponentFn,
  plugin: Plugin
): TextPropertyWidgetComponent {
  if (!isTextPropertyWidgetComponentPatched) {
    const temp = el.createDiv();
    const fakeData = modifyData(data, '');

    const textPropertyWidgetComponent = renderTextPropertyWidgetComponent(next, temp, fakeData, ctx);
    const textPropertyWidgetComponentProto = getPrototypeOf(textPropertyWidgetComponent);
    registerPatch(plugin, textPropertyWidgetComponentProto, {
      getDisplayText: () =>
        function getDisplayTextPatched(this: TextPropertyWidgetComponent): string {
          return getDisplayText(this);
        },
      getLinkText: () =>
        function getLinkTextPatched(this: TextPropertyWidgetComponent): string {
          return getLinkText(this);
        },
      isWikilink: () =>
        function isWikilinkPatched(this: TextPropertyWidgetComponent): boolean {
          return isWikilink(this);
        },
      render: (nextRender: () => void) =>
        function renderPatched(this: TextPropertyWidgetComponent): void {
          render(this, nextRender);
        }
    });
    isTextPropertyWidgetComponentPatched = true;
    temp.remove();
  }

  const ctxWithRerenderOnChange = {
    ...ctx,
    onChange: (newValue: unknown): void => {
      ctx.onChange(newValue);
      const str = newValue as null | string;
      requestAnimationFrame(() => {
        el.empty();
        renderWidget(el, modifyData(data, str), ctx, next, plugin);
      });
    }
  };

  const value = (isPropertyEntryData(data) ? data.value : data) ?? '';

  const parseLinkResults = parseLinks(value);

  el.addClass('frontmatter-markdown-links', 'text-property-widget-component');
  const childWidgetsContainerEl = el.createDiv('metadata-property-value');

  let startOffset = 0;

  for (const parseLinkResult of parseLinkResults) {
    createChildWidget(startOffset, parseLinkResult.startOffset);
    createChildWidget(parseLinkResult.startOffset, parseLinkResult.endOffset);
    startOffset = parseLinkResult.endOffset;
  }

  createChildWidget(startOffset, value.length);

  if (value === '') {
    createChildWidget(startOffset, 1);
  }

  const widgetEl = el.createDiv('metadata-property-value');
  const widget = renderTextPropertyWidgetComponent(next, widgetEl, data, ctxWithRerenderOnChange);
  widgetEl.hide();

  widget.inputEl.addEventListener('blur', () => {
    widgetEl.hide();
    childWidgetsContainerEl.show();
  });

  patchedInputEls.set(widget.inputEl, { from: 0, to: 0 });
  return widget;

  function createChildWidget(widgetStartOffset: number, widgetEndOffset: number): void {
    if (widgetStartOffset >= widgetEndOffset) {
      return;
    }

    const childWidgetValue = value.slice(widgetStartOffset, widgetEndOffset);
    const childEl = childWidgetsContainerEl.createDiv('metadata-property-value');
    const childWidgetData = modifyData(data, childWidgetValue);

    const childWidget = renderTextPropertyWidgetComponent(next, childEl, childWidgetData, ctx);
    childWidget.inputEl.addEventListener('focus', () => {
      requestAnimationFrame(() => {
        const caretOffset = getCaretCharacterOffset();
        childWidgetsContainerEl.hide();
        widgetEl.show();
        widget.inputEl.focus();
        const sel = widget.inputEl.win.getSelection();
        if (!sel) {
          return;
        }
        if (!widget.inputEl.firstChild) {
          return;
        }

        const range = widget.inputEl.doc.createRange();
        range.setStart(widget.inputEl.firstChild, widgetStartOffset + caretOffset);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      });
    });
  }
}

function selectSuggestion(
  next: SelectSuggestionFn,
  suggest: AbstractInputSuggest<MySearchResult>,
  value: MySearchResult,
  evt: KeyboardEvent | MouseEvent
): void {
  if (!patchedInputEls.has(suggest.textInputEl)) {
    next.call(suggest, value, evt);
    return;
  }

  const oldValue = suggest.textInputEl.textContent ?? '';
  next.call(suggest, value, evt);
  const newValue = suggest.textInputEl.textContent ?? '';
  const { from, to } = patchedInputEls.get(suggest.textInputEl) ?? { from: 0, to: 0 };
  patchedInputEls.set(suggest.textInputEl, { from: 0, to: 0 });

  const fixedValue = oldValue.slice(0, from) + newValue + oldValue.slice(to);
  next.call(suggest, {
    ...value,
    text: fixedValue,
    type: 'text'
  }, evt);
}

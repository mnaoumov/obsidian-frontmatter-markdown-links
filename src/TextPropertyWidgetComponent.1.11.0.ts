import type { SearchResult } from 'obsidian';
import type { ParseLinkResult } from 'obsidian-dev-utils/obsidian/Link';
import type {
  MetadataTypeManagerRegisteredTypeWidgetsRecord,
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

function getParseLinkResult(textPropertyComponent: TextPropertyWidgetComponent, useValue = false): null | ParseLinkResult {
  const text = useValue ? textPropertyComponent.value : textPropertyComponent.inputEl.textContent;
  return parseLink(text);
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

function render(textPropertyComponent: TextPropertyWidgetComponent, next: () => void): void {
  const parseLinkResult = getParseLinkResult(textPropertyComponent, true);
  if (parseLinkResult?.isExternal && parseLinkResult.hasAngleBrackets) {
    textPropertyComponent.value = parseLinkResult.encodedUrl ?? parseLinkResult.url;
  } else if (parseLinkResult?.isEmbed) {
    textPropertyComponent.value = parseLinkResult.raw.slice(1);
  }
  next.call(textPropertyComponent);
}

function renderWidget(
  el: HTMLElement,
  data: unknown,
  ctx: PropertyRenderContext,
  next: RenderTextPropertyWidgetComponentFn,
  plugin: Plugin
): TextPropertyWidgetComponent {
  if (typeof data !== 'string') {
    return next(el, data, ctx);
  }

  const str = data;

  if (!isTextPropertyWidgetComponentPatched) {
    const temp = el.createDiv();
    const textPropertyWidgetComponent = next(temp, '', ctx);
    const textPropertyWidgetComponentProto = getPrototypeOf(textPropertyWidgetComponent);
    registerPatch(plugin, textPropertyWidgetComponentProto, {
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
      requestAnimationFrame(() => {
        el.empty();
        renderWidget(el, newValue, ctx, next, plugin);
      });
    }
  };

  const parseLinkResults = parseLinks(str);
  el.addClass('frontmatter-markdown-links', 'text-property-widget-component');
  const childWidgetsContainerEl = el.createDiv('metadata-property-value');

  const hasMultipleLinks = parseLinkResults.length > 0 && parseLinkResults[0]?.raw !== str;

  if (hasMultipleLinks) {
    let startOffset = 0;

    for (const parseLinkResult of parseLinkResults) {
      createChildWidget(startOffset, parseLinkResult.startOffset);
      createChildWidget(parseLinkResult.startOffset, parseLinkResult.endOffset);
      startOffset = parseLinkResult.endOffset;
    }

    createChildWidget(startOffset, str.length);
  }

  const widget = next(el, str, ctxWithRerenderOnChange);
  if (hasMultipleLinks) {
    widget.inputEl.hide();
    hideMetadataLink(widget);
    el.appendChild(childWidgetsContainerEl);

    widget.inputEl.addEventListener('blur', () => {
      widget.inputEl.hide();
      hideMetadataLink(widget);
      childWidgetsContainerEl.show();
    });

    patchedInputEls.set(widget.inputEl, { from: 0, to: 0 });
  }

  return widget;

  function hideMetadataLink(widget2: TextPropertyWidgetComponent): void {
    const metadataLinkEl = widget2.containerEl.find('.metadata-link') as HTMLElement | null;
    metadataLinkEl?.hide();
  }

  function createChildWidget(widgetStartOffset: number, widgetEndOffset: number): void {
    if (widgetStartOffset >= widgetEndOffset) {
      return;
    }

    const childWidgetValue = str.slice(widgetStartOffset, widgetEndOffset);
    const childEl = childWidgetsContainerEl.createDiv('metadata-property-value');

    const childWidget = next(childEl, childWidgetValue, ctx);
    childWidget.inputEl.addEventListener('focus', () => {
      requestAnimationFrame(() => {
        const caretOffset = getCaretCharacterOffset();
        childWidgetsContainerEl.hide();
        widget.inputEl.show();
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

  const oldValue = suggest.textInputEl.textContent;
  next.call(suggest, value, evt);
  const newValue = suggest.textInputEl.textContent;
  const { from, to } = patchedInputEls.get(suggest.textInputEl) ?? { from: 0, to: 0 };
  patchedInputEls.set(suggest.textInputEl, { from: 0, to: 0 });

  const fixedValue = oldValue.slice(0, from) + newValue + oldValue.slice(to);
  next.call(suggest, {
    ...value,
    text: fixedValue,
    type: 'text'
  }, evt);
}

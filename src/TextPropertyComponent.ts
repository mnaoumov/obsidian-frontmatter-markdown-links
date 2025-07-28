import type { Component } from 'obsidian';
import type { ParseLinkResult } from 'obsidian-dev-utils/obsidian/Link';
import type { MaybeReturn } from 'obsidian-dev-utils/Type';
import type {
  PropertyEntryData,
  PropertyRenderContext,
  PropertyWidget
} from 'obsidian-typings';

import { getPrototypeOf } from 'obsidian-dev-utils/Object';
import {
  parseLink,
  parseLinks
} from 'obsidian-dev-utils/obsidian/Link';
import { registerPatch } from 'obsidian-dev-utils/obsidian/MonkeyAround';

import type { Plugin } from './Plugin.ts';

let isPatched = false;

type RenderTextPropertyWidgetFn = PropertyWidget<null | string>['render'];

interface TextPropertyComponent extends Component {
  ctx: PropertyRenderContext;
  getDisplayText(): string;
  getLinkText(): string;
  inputEl: HTMLElement;
  isWikilink(): boolean;
  linkEl: HTMLElement;
  linkTextEl: HTMLElement;
  render(): void;
  value: string | undefined;
}

export function patchTextPropertyComponent(plugin: Plugin): void {
  const widget = plugin.app.metadataTypeManager.registeredTypeWidgets['text'];

  if (!widget) {
    return;
  }

  registerPatch(plugin, widget, {
    render: (next: RenderTextPropertyWidgetFn): RenderTextPropertyWidgetFn => (el, value, ctx): MaybeReturn<Component> =>
      renderWidget(el, value, ctx, next, plugin)
  });
}

function getDisplayText(textPropertyComponent: TextPropertyComponent): string {
  const parseLinkResult = getParseLinkResult(textPropertyComponent);
  return parseLinkResult?.alias ?? parseLinkResult?.url ?? textPropertyComponent.value ?? '';
}

function getLinkText(textPropertyComponent: TextPropertyComponent): string {
  const parseLinkResult = getParseLinkResult(textPropertyComponent);
  return parseLinkResult?.url ?? textPropertyComponent.value ?? '';
}

function getParseLinkResult(textPropertyComponent: TextPropertyComponent, useValue = false): null | ParseLinkResult {
  const text = useValue ? textPropertyComponent.value : textPropertyComponent.inputEl.textContent;
  return parseLink(text ?? '');
}

function isPropertyEntryData(data: null | PropertyEntryData<null | string> | string): data is PropertyEntryData<null | string> {
  return (data as null | Partial<PropertyEntryData<null | string>>)?.value !== undefined;
}

function isWikilink(textPropertyComponent: TextPropertyComponent): boolean {
  const parseLinkResult = getParseLinkResult(textPropertyComponent);
  return !!parseLinkResult && (parseLinkResult.isWikilink || !parseLinkResult.isExternal);
}

function modifyData(data: null | PropertyEntryData<null | string> | string, newValue: null | string): null | PropertyEntryData<null | string> | string {
  if (isPropertyEntryData(data)) {
    return { ...data, value: newValue };
  }

  return newValue;
}

function render(textPropertyComponent: TextPropertyComponent, next: () => void): void {
  const parseLinkResult = getParseLinkResult(textPropertyComponent, true);
  if (parseLinkResult?.isExternal) {
    textPropertyComponent.value = parseLinkResult.encodedUrl ?? parseLinkResult.url;
  }
  next.call(textPropertyComponent);
}

function renderWidget(
  el: HTMLElement,
  data: null | PropertyEntryData<null | string> | string,
  ctx: PropertyRenderContext,
  next: RenderTextPropertyWidgetFn,
  plugin: Plugin
): MaybeReturn<Component> {
  if (!isPatched) {
    const temp = el.createDiv();
    const fakeData = modifyData(data, '');
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const textPropertyComponent = (isPropertyEntryData(fakeData) ? next(temp, fakeData, ctx) : next(temp, fakeData, ctx)) as TextPropertyComponent;
    const textPropertyComponentProto = getPrototypeOf(textPropertyComponent);
    registerPatch(plugin, textPropertyComponentProto, {
      getDisplayText: () =>
        function getDisplayTextPatched(this: TextPropertyComponent): string {
          return getDisplayText(this);
        },
      getLinkText: () =>
        function getLinkTextPatched(this: TextPropertyComponent): string {
          return getLinkText(this);
        },
      isWikilink: () =>
        function isWikilinkPatched(this: TextPropertyComponent): boolean {
          return isWikilink(this);
        },
      render: (nextRender: () => void) =>
        function renderPatched(this: TextPropertyComponent): void {
          render(this, nextRender);
        }
    });
    isPatched = true;
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

  const value = isPropertyEntryData(data) ? data.value : data;

  if (value === null) {
    if (isPropertyEntryData(data)) {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      return next(el, data, ctxWithRerenderOnChange);
    }

    return next(el, data, ctxWithRerenderOnChange);
  }

  const parseLinkResults = parseLinks(value);
  if (parseLinkResults.length === 0 || parseLinkResults[0]?.raw === value) {
    if (isPropertyEntryData(data)) {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      return next(el, data, ctxWithRerenderOnChange);
    }

    return next(el, data, ctxWithRerenderOnChange);
  }

  el.addClass('frontmatter-markdown-links', 'text-property-component');

  let startOffset = 0;
  const childWidgetValues: string[] = [];

  for (const parseLinkResult of parseLinkResults) {
    createChildWidget(startOffset, parseLinkResult.startOffset);
    createChildWidget(parseLinkResult.startOffset, parseLinkResult.endOffset);
    startOffset = parseLinkResult.endOffset;
  }

  createChildWidget(startOffset, value.length);

  function createChildWidget(widgetStartOffset: number, widgetEndOffset: number): void {
    if (widgetStartOffset >= widgetEndOffset) {
      return;
    }

    const childWidgetValue = (value ?? '').slice(widgetStartOffset, widgetEndOffset);
    childWidgetValues.push(childWidgetValue);
    const index = childWidgetValues.length - 1;

    let isAfterBlur = false;
    const childCtx = {
      ...ctx,
      blur: (): void => {
        isAfterBlur = true;
        ctx.blur();
      },
      onChange: (newValue: unknown): void => {
        const newValueStr = (newValue as null | string) ?? '';

        if (isAfterBlur) {
          isAfterBlur = false;

          if (newValueStr === childWidgetValues[index]?.trimEnd()) {
            return;
          }
        }

        if (childWidgetValues[index] === newValueStr) {
          return;
        }

        childWidgetValues[index] = newValueStr;
        const newFullValue = childWidgetValues.join('');
        ctxWithRerenderOnChange.onChange(newFullValue);
      }
    };

    const childEl = el.createDiv('metadata-property-value');
    const childWidgetData = modifyData(data, childWidgetValue);
    if (isPropertyEntryData(childWidgetData)) {
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      next(childEl, childWidgetData, childCtx);
    } else {
      next(childEl, childWidgetData, childCtx);
    }
  }
}

import type { ParseLinkResult } from 'obsidian-dev-utils/obsidian/Link';
import type {
  MetadataTypeManagerRegisteredTypeWidgetsRecord,
  PropertyEntryData,
  PropertyRenderContext,
  TextPropertyWidgetComponent
} from 'obsidian-typings';

import { getPrototypeOf } from 'obsidian-dev-utils/ObjectUtils';
import {
  parseLink,
  parseLinks
} from 'obsidian-dev-utils/obsidian/Link';
import { registerPatch } from 'obsidian-dev-utils/obsidian/MonkeyAround';

import type { Plugin } from './Plugin.ts';

type RenderTextPropertyWidgetComponentFn = MetadataTypeManagerRegisteredTypeWidgetsRecord['text']['render'];

let isPatched = false;

export function patchTextPropertyWidgetComponent(plugin: Plugin): void {
  const widget = plugin.app.metadataTypeManager.registeredTypeWidgets.text;

  registerPatch(plugin, widget, {
    render: (next: RenderTextPropertyWidgetComponentFn): RenderTextPropertyWidgetComponentFn => (el, value, ctx) => renderWidget(el, value, ctx, next, plugin)
  });
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
  if (!isPatched) {
    const temp = el.createDiv();
    const fakeData = modifyData(data, '');

    const textPropertyComponent = renderTextPropertyWidgetComponent(next, temp, fakeData, ctx);
    const textPropertyComponentProto = getPrototypeOf(textPropertyComponent);
    registerPatch(plugin, textPropertyComponentProto, {
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
    return renderTextPropertyWidgetComponent(next, el, data, ctxWithRerenderOnChange);
  }

  const parseLinkResults = parseLinks(value);
  if (parseLinkResults.length === 0 || parseLinkResults[0]?.raw === value) {
    return renderTextPropertyWidgetComponent(next, el, data, ctxWithRerenderOnChange);
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

  const widget = renderTextPropertyWidgetComponent(next, el, data, ctx);
  widget.inputEl.hide();
  widget.linkEl.hide();
  return widget;

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

    renderTextPropertyWidgetComponent(next, childEl, childWidgetData, childCtx);
  }
}

import type { Component } from 'obsidian';
import type { ParseLinkResult } from 'obsidian-dev-utils/obsidian/Link';
import type { MaybeReturn } from 'obsidian-dev-utils/Type';
import type {
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

type RenderTextPropertyWidgetFn = PropertyWidget['render'];

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
    render: (next: RenderTextPropertyWidgetFn) => (el, value, ctx): MaybeReturn<Component> => renderWidget(el, value, ctx, next, plugin)
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

function isWikilink(textPropertyComponent: TextPropertyComponent): boolean {
  const parseLinkResult = getParseLinkResult(textPropertyComponent);
  return !!parseLinkResult && (parseLinkResult.isWikilink || !parseLinkResult.isExternal);
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
  value: unknown,
  ctx: PropertyRenderContext,
  next: RenderTextPropertyWidgetFn,
  plugin: Plugin
): MaybeReturn<Component> {
  if (!isPatched) {
    const temp = el.createDiv();
    const textPropertyComponent = next(temp, '', ctx) as TextPropertyComponent;
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
    onChange: (widgetValue: unknown): void => {
      ctx.onChange(widgetValue);
      requestAnimationFrame(() => {
        el.empty();
        renderWidget(el, widgetValue, ctx, next, plugin);
      });
    }
  };

  if (typeof value !== 'string') {
    return next(el, value, ctxWithRerenderOnChange);
  }

  const parseLinkResults = parseLinks(value);
  if (parseLinkResults.length === 0 || parseLinkResults[0]?.raw === value) {
    return next(el, value, ctxWithRerenderOnChange);
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

    const childWidgetValue = (value as string).slice(widgetStartOffset, widgetEndOffset);
    childWidgetValues.push(childWidgetValue);
    const index = childWidgetValues.length - 1;

    let isAfterBlur = false;
    const childCtx = {
      ...ctx,
      blur: (): void => {
        isAfterBlur = true;
        ctx.blur();
      },
      onChange: (widgetValue: unknown): void => {
        if (isAfterBlur) {
          isAfterBlur = false;

          if (widgetValue === childWidgetValues[index]?.trimEnd()) {
            return;
          }
        }

        widgetValue ??= '';
        if (childWidgetValues[index] === widgetValue) {
          return;
        }

        if (typeof widgetValue !== 'string') {
          return;
        }

        childWidgetValues[index] = widgetValue;
        const newValue = childWidgetValues.join('');
        ctxWithRerenderOnChange.onChange(newValue);
      }
    };

    const childEl = el.createDiv('metadata-property-value');
    next(childEl, childWidgetValue, childCtx);
  }
}

import type { Component } from 'obsidian';
import type { ParseLinkResult } from 'obsidian-dev-utils/obsidian/Link';
import type { MaybeReturn } from 'obsidian-dev-utils/Type';
import type {
  PropertyEntryData,
  PropertyRenderContext,
  PropertyWidget
} from 'obsidian-typings';

import { getPrototypeOf } from 'obsidian-dev-utils/Object';
import { parseLink } from 'obsidian-dev-utils/obsidian/Link';
import { registerPatch } from 'obsidian-dev-utils/obsidian/MonkeyAround';

import type { Plugin } from './Plugin.ts';

let isPatched = false;

type RenderTextPropertyWidgetFn = PropertyWidget<string>['render'];

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
  const widget = plugin.app.metadataTypeManager.registeredTypeWidgets['text'] as PropertyWidget<string>;

  registerPatch(plugin, widget, {
    render: (next: RenderTextPropertyWidgetFn) => (el, data, ctx): MaybeReturn<Component> => renderWidget(el, data, ctx, next, plugin)
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
  data: PropertyEntryData<string>,
  ctx: PropertyRenderContext,
  next: RenderTextPropertyWidgetFn,
  plugin: Plugin
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
): Component | void {
  const textPropertyComponent = next(el, data, ctx) as TextPropertyComponent | undefined;
  if (!textPropertyComponent || isPatched) {
    return textPropertyComponent;
  }

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

  textPropertyComponent.inputEl.remove();
  textPropertyComponent.linkEl.remove();
  return renderWidget(el, data, ctx, next, plugin);
}

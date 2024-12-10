import type { Component } from 'obsidian';
import type { ParseLinkResult } from 'obsidian-dev-utils/obsidian/Link';
import type {
  PropertyEntryData,
  PropertyRenderContext,
  PropertyWidget
} from 'obsidian-typings';

import { around } from 'monkey-around';
import { getPrototypeOf } from 'obsidian-dev-utils/Object';
import { parseLink } from 'obsidian-dev-utils/obsidian/Link';

import type { FrontmatterMarkdownLinksPlugin } from './FrontmatterMarkdownLinksPlugin.ts';

let isPatched = false;

// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
type RenderTextPropertyWidgetFn = (el: HTMLElement, data: PropertyEntryData<string>, ctx: PropertyRenderContext) => Component | void;

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

export function patchTextPropertyComponent(plugin: FrontmatterMarkdownLinksPlugin): void {
  const widget = plugin.app.metadataTypeManager.registeredTypeWidgets['text'] as PropertyWidget<string>;

  plugin.register(around(widget, {
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    render: (next: RenderTextPropertyWidgetFn) => (el, data, ctx): Component | void => renderWidget(el, data, ctx, next, plugin)
  }));
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

function patchTextPropertyComponentProto(textPropertyComponentProto: TextPropertyComponent): () => void {
  return around(textPropertyComponentProto, {
    getDisplayText: () => function (this: TextPropertyComponent): string {
      return getDisplayText(this);
    },
    getLinkText: () => function (this: TextPropertyComponent): string {
      return getLinkText(this);
    },
    isWikilink: () => function (this: TextPropertyComponent): boolean {
      return isWikilink(this);
    },
    render: (next: () => void) => function (this: TextPropertyComponent): void {
      render(this, next);
    }
  });
}

function render(textPropertyComponent: TextPropertyComponent, next: () => void): void {
  const parseLinkResult = getParseLinkResult(textPropertyComponent, true);
  if (parseLinkResult?.isExternal) {
    textPropertyComponent.value = parseLinkResult.url;
  }
  next.call(textPropertyComponent);
}

// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
function renderWidget(el: HTMLElement, data: PropertyEntryData<string>, ctx: PropertyRenderContext, next: RenderTextPropertyWidgetFn, plugin: FrontmatterMarkdownLinksPlugin): Component | void {
  const textPropertyComponent = next(el, data, ctx) as TextPropertyComponent | undefined;
  if (!textPropertyComponent || isPatched) {
    return textPropertyComponent;
  }

  const textPropertyComponentProto = getPrototypeOf(textPropertyComponent);
  plugin.register(patchTextPropertyComponentProto(textPropertyComponentProto));
  isPatched = true;

  textPropertyComponent.inputEl.remove();
  textPropertyComponent.linkEl.remove();
  return renderWidget(el, data, ctx, next, plugin);
}

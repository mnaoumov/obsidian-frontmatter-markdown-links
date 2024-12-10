import type { Component } from 'obsidian';
import type {
  PropertyEntryData,
  PropertyRenderContext
  , PropertyWidget
} from 'obsidian-typings';

import { around } from 'monkey-around';
import { getPrototypeOf } from 'obsidian-dev-utils/Object';
import { parseLink } from 'obsidian-dev-utils/obsidian/Link';

import type { FrontmatterMarkdownLinksPlugin } from './FrontmatterMarkdownLinksPlugin.ts';

interface MultiSelectComponent extends Component {
  renderValues(): void;
  rootEl: HTMLElement;
  values: string[];
}

interface MultiTextPropertyComponent extends Component {
  containerEl: HTMLElement;
  multiselect: MultiSelectComponent;
}

// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
type RenderMultiTextPropertyWidgetFn = (el: HTMLElement, data: PropertyEntryData<string[]>, ctx: PropertyRenderContext) => Component | void;

let isPatched = false;

export function patchMultiTextPropertyComponent(plugin: FrontmatterMarkdownLinksPlugin): void {
  const widget = plugin.app.metadataTypeManager.registeredTypeWidgets['multitext'] as PropertyWidget<string[]>;
  plugin.register(around(widget, {
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    render: (next: RenderMultiTextPropertyWidgetFn) => (el, data, ctx): Component | void => renderWidget(el, data, ctx, next, plugin)
  }));
}

function patchMultiSelectComponentProto(multiSelectComponentProto: MultiSelectComponent): () => void {
  return around(multiSelectComponentProto, {
    renderValues: (next: () => void) => function (this: MultiSelectComponent) {
      renderValues(this, next);
    }
  });
}

function renderValues(multiSelectComponent: MultiSelectComponent, next: () => void): void {
  const aliases: string[] = [];
  multiSelectComponent.values = multiSelectComponent.values.map((value) => {
    const parseLinkResult = parseLink(value);
    aliases.push(parseLinkResult?.alias ?? parseLinkResult?.url ?? value);

    if (!parseLinkResult || parseLinkResult.isWikilink) {
      return value;
    }

    if (!parseLinkResult.isExternal) {
      return `[[${parseLinkResult.url}]]`;
    }

    return parseLinkResult.url;
  });
  next.call(multiSelectComponent);
  const renderedItemEls = Array.from(multiSelectComponent.rootEl.querySelectorAll('.multi-select-pill-content'));
  for (let i = 0; i < renderedItemEls.length; i++) {
    renderedItemEls[i]?.setText(aliases[i] ?? '');
  }
}

// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
function renderWidget(el: HTMLElement, data: PropertyEntryData<string[]>, ctx: PropertyRenderContext, next: RenderMultiTextPropertyWidgetFn, plugin: FrontmatterMarkdownLinksPlugin): Component | void {
  const multiTextPropertyComponent = next(el, data, ctx) as MultiTextPropertyComponent | undefined;
  if (!multiTextPropertyComponent || isPatched) {
    return multiTextPropertyComponent;
  }

  const multiSelectComponentProto = getPrototypeOf(multiTextPropertyComponent.multiselect);
  plugin.register(patchMultiSelectComponentProto(multiSelectComponentProto));
  isPatched = true;

  multiTextPropertyComponent.multiselect.rootEl.remove();
  return renderWidget(el, data, ctx, next, plugin);
}

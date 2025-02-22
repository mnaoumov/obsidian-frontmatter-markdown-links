import type {
  App,
  Component
} from 'obsidian';
import type {
  PropertyEntryData,
  PropertyRenderContext,
  PropertyWidget
} from 'obsidian-typings';

import { around } from 'monkey-around';
import { getPrototypeOf } from 'obsidian-dev-utils/Object';
import { parseLink } from 'obsidian-dev-utils/obsidian/Link';

import type { FrontmatterMarkdownLinksPlugin } from './FrontmatterMarkdownLinksPlugin.ts';

import { attachLinkData } from './LinkData.ts';

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

function patchMultiSelectComponentProto(app: App, multiSelectComponentProto: MultiSelectComponent): () => void {
  return around(multiSelectComponentProto, {
    renderValues: (next: () => void) =>
      function renderValuesPatched(this: MultiSelectComponent) {
        renderValues(app, this, next);
      }
  });
}

function renderValues(app: App, multiSelectComponent: MultiSelectComponent, next: () => void): void {
  next.call(multiSelectComponent);
  const renderedItemEls: HTMLElement[] = Array.from(multiSelectComponent.rootEl.querySelectorAll('.multi-select-pill-content'));
  for (let i = 0; i < renderedItemEls.length; i++) {
    const value = multiSelectComponent.values[i];
    if (!value) {
      continue;
    }
    const parseLinkResult = parseLink(value);
    if (!parseLinkResult) {
      continue;
    }

    const el = renderedItemEls[i];
    if (!el) {
      continue;
    }
    el.setText(parseLinkResult.alias ?? parseLinkResult.url);
    el.addClass(parseLinkResult.isExternal ? 'external-link' : 'internal-link');
    if (!parseLinkResult.isExternal) {
      const resolvedLink = app.metadataCache.getFirstLinkpathDest(parseLinkResult.url, app.workspace.getActiveFile()?.path ?? '');
      if (!resolvedLink) {
        el.addClass('is-unresolved');
      }
    }
    el.setAttribute('title', parseLinkResult.url);
    attachLinkData(el, {
      isExternalUrl: parseLinkResult.isExternal,
      url: parseLinkResult.url
    });
  }
}

function renderWidget(
  el: HTMLElement,
  data: PropertyEntryData<string[]>,
  ctx: PropertyRenderContext,
  next: RenderMultiTextPropertyWidgetFn,
  plugin: FrontmatterMarkdownLinksPlugin
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
): Component | void {
  const multiTextPropertyComponent = next(el, data, ctx) as MultiTextPropertyComponent | undefined;
  if (!multiTextPropertyComponent || isPatched) {
    return multiTextPropertyComponent;
  }

  const multiSelectComponentProto = getPrototypeOf(multiTextPropertyComponent.multiselect);
  plugin.register(patchMultiSelectComponentProto(plugin.app, multiSelectComponentProto));
  isPatched = true;

  multiTextPropertyComponent.multiselect.rootEl.remove();
  return renderWidget(el, data, ctx, next, plugin);
}

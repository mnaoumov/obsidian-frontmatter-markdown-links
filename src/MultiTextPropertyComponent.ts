import type {
  App,
  Component
} from 'obsidian';
import type { MaybeReturn } from 'obsidian-dev-utils/Type';
import type {
  PropertyRenderContext,
  PropertyWidget
} from 'obsidian-typings';

import { getPrototypeOf } from 'obsidian-dev-utils/Object';
import { parseLink } from 'obsidian-dev-utils/obsidian/Link';
import { registerPatch } from 'obsidian-dev-utils/obsidian/MonkeyAround';

import type { Plugin } from './Plugin.ts';

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

type RenderMultiTextPropertyWidgetFn = PropertyWidget['render'];

let isPatched = false;

export function patchMultiTextPropertyComponent(plugin: Plugin): void {
  const widget = plugin.app.metadataTypeManager.registeredTypeWidgets['multitext']!;
  registerPatch(plugin, widget, {
    render: (next: RenderMultiTextPropertyWidgetFn) => (el, value, ctx): MaybeReturn<Component> => renderWidget(el, value, ctx, next, plugin)
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
      isWikilink: parseLinkResult.isWikilink,
      url: parseLinkResult.url
    });
  }
}

function renderWidget(
  el: HTMLElement,
  value: unknown,
  ctx: PropertyRenderContext,
  next: RenderMultiTextPropertyWidgetFn,
  plugin: Plugin
): MaybeReturn<Component> {
  const multiTextPropertyComponent = next(el, value, ctx) as MultiTextPropertyComponent | undefined;
  if (!multiTextPropertyComponent || isPatched) {
    return multiTextPropertyComponent;
  }

  const multiSelectComponentProto = getPrototypeOf(multiTextPropertyComponent.multiselect);
  registerPatch(plugin, multiSelectComponentProto, {
    renderValues: (nextRenderValues: () => void) => {
      return function renderValuesPatched(this: MultiSelectComponent): void {
        renderValues(plugin.app, this, nextRenderValues);
      };
    }
  });

  isPatched = true;

  multiTextPropertyComponent.multiselect.rootEl.remove();
  return renderWidget(el, value, ctx, next, plugin);
}

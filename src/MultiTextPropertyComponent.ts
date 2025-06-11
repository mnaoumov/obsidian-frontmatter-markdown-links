import type {
  App,
  Component
} from 'obsidian';
import type {
  PropertyEntryData,
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

type RenderMultiTextPropertyWidgetFn = PropertyWidget<string[]>['render'];

let isPatched = false;

export function patchMultiTextPropertyComponent(plugin: Plugin): void {
  const widget = plugin.app.metadataTypeManager.registeredTypeWidgets['multitext'] as PropertyWidget<string[]>;
  registerPatch(plugin, widget, {
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    render: (next: RenderMultiTextPropertyWidgetFn) => (el, data, ctx): Component | void => renderWidget(el, data, ctx, next, plugin)
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
  data: PropertyEntryData<string[]>,
  ctx: PropertyRenderContext,
  next: RenderMultiTextPropertyWidgetFn,
  plugin: Plugin
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
): Component | void {
  const multiTextPropertyComponent = next(el, data, ctx) as MultiTextPropertyComponent | undefined;
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
  return renderWidget(el, data, ctx, next, plugin);
}

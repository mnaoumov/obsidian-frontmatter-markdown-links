import type {
  App,
  Component
} from 'obsidian';
import type { ParseLinkResult } from 'obsidian-dev-utils/obsidian/Link';
import type { MaybeReturn } from 'obsidian-dev-utils/Type';
import type {
  PropertyEntryData,
  PropertyRenderContext,
  PropertyWidget
} from 'obsidian-typings';

import { getPrototypeOf } from 'obsidian-dev-utils/Object';
import { parseLinks } from 'obsidian-dev-utils/obsidian/Link';
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

type RenderMultiTextPropertyWidgetFn = PropertyWidget<null | string[]>['render'];

let isPatched = false;

export function patchMultiTextPropertyComponent(plugin: Plugin): void {
  const widget = plugin.app.metadataTypeManager.registeredTypeWidgets['multitext'];
  if (!widget) {
    return;
  }

  registerPatch(plugin, widget, {
    render: (next: RenderMultiTextPropertyWidgetFn): RenderMultiTextPropertyWidgetFn => (el, data, ctx) => renderWidget(el, data, ctx, next, plugin)
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
    const parseLinkResults = parseLinks(value);
    if (parseLinkResults.length === 0) {
      continue;
    }

    const el = renderedItemEls[i];
    if (!el) {
      continue;
    }

    if (parseLinkResults[0]?.raw === value) {
      renderChild(el, parseLinkResults[0]);
      continue;
    }

    el.empty();

    const parentEl = el.parentElement;
    if (!parentEl) {
      continue;
    }

    for (const el2 of [el, parentEl]) {
      el2.removeClass('internal-link', 'external-link', 'is-unresolved');
    }

    parentEl.addEventListener('mouseover', (evt) => {
      evt.stopPropagation();
    }, { capture: true });

    let startOffset = 0;

    for (const parseLinkResult of parseLinkResults) {
      if (startOffset < parseLinkResult.startOffset) {
        el.createDiv({ text: value.slice(startOffset, parseLinkResult.startOffset) });
      }

      const childEl = el.createDiv();
      renderChild(childEl, parseLinkResult);
      startOffset += parseLinkResult.endOffset;
    }

    if (startOffset < value.length) {
      el.createDiv({ text: value.slice(startOffset) });
    }

    function renderChild(childEl: HTMLElement, parseLinkResult: ParseLinkResult): void {
      childEl.setText(parseLinkResult.alias ?? parseLinkResult.url);
      childEl.addClass(parseLinkResult.isExternal ? 'external-link' : 'internal-link');
      if (!parseLinkResult.isExternal) {
        const resolvedLink = app.metadataCache.getFirstLinkpathDest(parseLinkResult.url, app.workspace.getActiveFile()?.path ?? '');
        if (!resolvedLink) {
          childEl.addClass('is-unresolved');
        }
      }
      childEl.setAttribute('title', parseLinkResult.url);
      attachLinkData(childEl, {
        isExternalUrl: parseLinkResult.isExternal,
        isWikilink: parseLinkResult.isWikilink,
        url: parseLinkResult.url
      });
    }
  }
}

function renderWidget(
  el: HTMLElement,
  data: (null | string[]) | PropertyEntryData<null | string[]>,
  ctx: PropertyRenderContext,
  next: RenderMultiTextPropertyWidgetFn,
  plugin: Plugin
): MaybeReturn<Component> {
  if (!isPatched) {
    const temp = el.createDiv();
    const multiTextPropertyComponent = next(temp, [], ctx) as MultiTextPropertyComponent;
    const multiSelectComponentProto = getPrototypeOf(multiTextPropertyComponent.multiselect);
    registerPatch(plugin, multiSelectComponentProto, {
      renderValues: (nextRenderValues: () => void) => {
        return function renderValuesPatched(this: MultiSelectComponent): void {
          renderValues(plugin.app, this, nextRenderValues);
        };
      }
    });

    isPatched = true;
    temp.remove();
  }

  if (data === null || Array.isArray(data)) {
    return next(el, data, ctx);
  }

  // eslint-disable-next-line @typescript-eslint/no-deprecated
  return next(el, data, ctx);
}

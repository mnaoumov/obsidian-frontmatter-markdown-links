import type {
  App,
  Component
} from 'obsidian';
import type { ParseLinkResult } from 'obsidian-dev-utils/obsidian/Link';
import type {
  MetadataTypeManagerRegisteredTypeWidgetsRecord,
  MultitextPropertyWidgetComponent,
  PropertyEntryData,
  PropertyRenderContext
} from 'obsidian-typings';

import { getPrototypeOf } from 'obsidian-dev-utils/ObjectUtils';
import { parseLinks } from 'obsidian-dev-utils/obsidian/Link';
import { registerPatch } from 'obsidian-dev-utils/obsidian/MonkeyAround';

import type { Plugin } from './Plugin.ts';

import { attachLinkData } from './LinkData.ts';

interface MultiSelectComponent extends Component {
  renderValues(): void;
  rootEl: HTMLElement;
  values: string[];
}

type RenderMultiTextPropertyWidgetComponentFn = MetadataTypeManagerRegisteredTypeWidgetsRecord['multitext']['render'];

let isPatched = false;

export function patchMultiTextPropertyWidgetComponent(plugin: Plugin): void {
  const widget = plugin.app.metadataTypeManager.registeredTypeWidgets.multitext;

  registerPatch(plugin, widget, {
    render: (next: RenderMultiTextPropertyWidgetComponentFn): RenderMultiTextPropertyWidgetComponentFn => (el, data, ctx) =>
      renderWidget(el, data, ctx, next, plugin)
  });
}

function renderMultiTextPropertyWidgetComponent(
  next: RenderMultiTextPropertyWidgetComponentFn,
  el: HTMLElement,
  data: (null | string[]) | PropertyEntryData<null | string[]>,
  ctx: PropertyRenderContext
): MultitextPropertyWidgetComponent {
  if (Array.isArray(data)) {
    return next(el, data, ctx);
  }

  // eslint-disable-next-line @typescript-eslint/no-deprecated
  return next(el, data as PropertyEntryData<string[]>, ctx);
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

    parentEl.addEventListener('click', (evt) => {
      if (!(evt.target instanceof Element)) {
        return;
      }
      if (evt.target.closest('.multi-select-pill-remove-button')) {
        return;
      }
      evt.stopPropagation();
    }, { capture: true });

    el.addClass('frontmatter-markdown-links', 'multi-text-property-component');

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
  next: RenderMultiTextPropertyWidgetComponentFn,
  plugin: Plugin
): MultitextPropertyWidgetComponent {
  if (!isPatched) {
    const temp = el.createDiv();
    const multiTextPropertyComponent = next(temp, [], ctx);
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

  return renderMultiTextPropertyWidgetComponent(next, el, data, ctx);
}

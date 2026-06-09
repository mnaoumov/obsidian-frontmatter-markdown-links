import type {
  MetadataTypeManagerRegisteredTypeWidgetsRecord,
  MultitextPropertyWidgetComponent,
  PropertyRenderContext
} from '@obsidian-typings/obsidian-public-latest';
import type { App } from 'obsidian';
import type { ComponentEx } from 'obsidian-dev-utils/obsidian/components/component-ex';
import type { ParseLinkResult } from 'obsidian-dev-utils/obsidian/link';

import { getPrototypeOf } from 'obsidian-dev-utils/object-utils';
import { MonkeyAroundComponent } from 'obsidian-dev-utils/obsidian/components/monkey-around-component';
import {
  parseLinks,
  splitSubpath
} from 'obsidian-dev-utils/obsidian/link';
import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';

import type { Plugin } from './plugin.ts';

import { attachLinkData } from './link-data.ts';
import { extractDisplayText } from './utils.ts';

interface MultiSelectComponent extends ComponentEx {
  renderValues(): void;
  rootEl: HTMLElement;
  values: string[];
}

type RenderMultiTextPropertyWidgetComponentFn = MetadataTypeManagerRegisteredTypeWidgetsRecord['multitext']['render'];

let isPatched = false;

export function patchMultiTextPropertyWidgetComponent(plugin: Plugin): void {
  const widget = plugin.app.metadataTypeManager.registeredTypeWidgets.multitext;
  const patch = plugin.addChild(new MonkeyAroundComponent());

  patch.registerPatch(widget, {
    render: (next: RenderMultiTextPropertyWidgetComponentFn): RenderMultiTextPropertyWidgetComponentFn => (el, data, ctx) =>
      renderWidget(el, data, ctx, next, plugin)
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

    const el = ensureNonNullable(renderedItemEls[i]);

    const firstParseLinkResult = ensureNonNullable(parseLinkResults[0]);
    const isSingleValue = firstParseLinkResult.raw === value;

    if (isSingleValue) {
      renderChild(el, firstParseLinkResult);
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
      startOffset = parseLinkResult.endOffset;
    }

    if (startOffset < value.length) {
      el.createDiv({ text: value.slice(startOffset) });
    }

    function renderChild(childEl: HTMLElement, parseLinkResult: ParseLinkResult): void {
      childEl.setText('');
      childEl.createSpan({ text: extractDisplayText(parseLinkResult) });
      if (parseLinkResult.isExternal) {
        childEl.addClass('external-link');
      } else {
        addClassToElementAndParent(childEl, 'internal-link');
        const resolvedLink = app.metadataCache.getFirstLinkpathDest(splitSubpath(parseLinkResult.url).linkPath, app.workspace.getActiveFile()?.path ?? '');
        if (!resolvedLink) {
          addClassToElementAndParent(childEl, 'is-unresolved');
        }
      }
      childEl.setAttribute('title', parseLinkResult.url);
      attachLinkData(childEl, {
        isExternalUrl: parseLinkResult.isExternal,
        isWikilink: parseLinkResult.isWikilink,
        url: parseLinkResult.url
      });
    }

    function addClassToElementAndParent(childEl: HTMLElement, className: string): void {
      childEl.addClass(className);
      if (isSingleValue) {
        childEl.parentElement?.addClass(className);
      }
    }
  }
}

function renderWidget(
  el: HTMLElement,
  data: unknown,
  ctx: PropertyRenderContext,
  next: RenderMultiTextPropertyWidgetComponentFn,
  plugin: Plugin
): MultitextPropertyWidgetComponent {
  if (!isPatched) {
    const temp = el.createDiv();
    const multiTextPropertyComponent = next(temp, [], ctx);
    const multiSelectComponentProto = getPrototypeOf(multiTextPropertyComponent.multiselect);
    const patch = plugin.addChild(new MonkeyAroundComponent());
    patch.registerPatch(multiSelectComponentProto, {
      renderValues: (nextRenderValues: () => void) => {
        return function renderValuesPatched(this: MultiSelectComponent): void {
          renderValues(plugin.app, this, nextRenderValues);
        };
      }
    });

    isPatched = true;
    temp.remove();
  }

  return next(el, data, ctx);
}

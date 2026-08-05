import type { Multiselect } from '@obsidian-typings/obsidian-public-latest';
import type { App } from 'obsidian';

import { getPrototypeOf } from 'obsidian-dev-utils/object-utils';
import { MonkeyAroundComponent } from 'obsidian-dev-utils/obsidian/components/monkey-around-component';
import { parseLinks } from 'obsidian-dev-utils/obsidian/parse-link';
import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';

import { renderLinkChild } from '../render-links.ts';

interface MultiTextPropertyComponentRenderValuesPatchComponentConstructorParams {
  readonly app: App;
  readonly multiselect: Multiselect;
}

export class MultiTextPropertyComponentRenderValuesPatchComponent extends MonkeyAroundComponent {
  private readonly app: App;
  private readonly multiselect: Multiselect;

  public constructor(params: MultiTextPropertyComponentRenderValuesPatchComponentConstructorParams) {
    super();
    this.app = params.app;
    this.multiselect = params.multiselect;
  }

  public override onload(): void {
    this.registerMethodPatch({
      $object: getPrototypeOf(this.multiselect),
      methodName: 'renderValues',
      patchHandler: ({
        fallback,
        originalThis
      }) => {
        const app = this.app;
        fallback();
        const renderedItemEls: HTMLElement[] = [...originalThis.rootEl.querySelectorAll<HTMLElement>('.multi-select-pill-content')];
        for (const [index, renderedItemEl] of renderedItemEls.entries()) {
          const value = originalThis.values[index];
          if (!value) {
            continue;
          }
          const parseLinkResults = parseLinks(value);
          if (parseLinkResults.length === 0) {
            continue;
          }

          const el = renderedItemEl;

          const firstParseLinkResult = ensureNonNullable(parseLinkResults[0]);
          const isSingleValue = firstParseLinkResult.raw === value;

          if (isSingleValue) {
            renderLinkChild({
              app,
              childEl: el,
              parseLinkResult: firstParseLinkResult,
              shouldClassParent: isSingleValue
            });
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

          parentEl.addEventListener('mouseover', ($event) => {
            $event.stopPropagation();
          }, { capture: true });

          parentEl.addEventListener('click', ($event) => {
            if (!($event.target instanceof Element)) {
              return;
            }
            if ($event.target.closest('.multi-select-pill-remove-button')) {
              return;
            }
            $event.stopPropagation();
          }, { capture: true });

          el.addClass('frontmatter-markdown-links', 'multi-text-property-component');

          let startOffset = 0;

          for (const parseLinkResult of parseLinkResults) {
            if (startOffset < parseLinkResult.startOffset) {
              el.createDiv({ text: value.slice(startOffset, parseLinkResult.startOffset) });
            }

            const childEl = el.createDiv();
            renderLinkChild({
              app,
              childEl,
              parseLinkResult,
              shouldClassParent: isSingleValue
            });
            startOffset = parseLinkResult.endOffset;
          }

          if (startOffset < value.length) {
            el.createDiv({ text: value.slice(startOffset) });
          }
        }
      }
    });
  }
}

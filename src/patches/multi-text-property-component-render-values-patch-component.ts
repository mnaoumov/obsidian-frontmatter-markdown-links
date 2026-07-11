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
      methodName: 'renderValues',
      obj: getPrototypeOf(this.multiselect),
      patchHandler: ({
        fallback,
        originalThis
      }) => {
        const app = this.app;
        fallback();
        const renderedItemEls: HTMLElement[] = Array.from(originalThis.rootEl.querySelectorAll('.multi-select-pill-content'));
        for (let i = 0; i < renderedItemEls.length; i++) {
          const value = originalThis.values[i];
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

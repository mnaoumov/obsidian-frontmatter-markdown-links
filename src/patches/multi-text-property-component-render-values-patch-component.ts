import type { Multiselect } from '@obsidian-typings/obsidian-public-latest';
import type { App } from 'obsidian';
import type { ParseLinkResult } from 'obsidian-dev-utils/obsidian/link';

import { getPrototypeOf } from 'obsidian-dev-utils/object-utils';
import { MonkeyAroundComponent } from 'obsidian-dev-utils/obsidian/components/monkey-around-component';
import {
  parseLinks,
  splitSubpath
} from 'obsidian-dev-utils/obsidian/link';
import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';

import { attachLinkData } from '../link-data.ts';
import { extractDisplayText } from '../parse-link-result.ts';

interface AddClassToElementAndParentParams {
  readonly childEl: HTMLElement;
  readonly className: string;
  readonly isSingleValue: boolean;
}

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
              addClassToElementAndParent({
                childEl,
                className: 'internal-link',
                isSingleValue
              });
              const resolvedLink = app.metadataCache.getFirstLinkpathDest(splitSubpath(parseLinkResult.url).linkPath, app.workspace.getActiveFile()?.path ?? '');
              if (!resolvedLink) {
                addClassToElementAndParent({
                  childEl,
                  className: 'is-unresolved',
                  isSingleValue
                });
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
    });
  }
}

function addClassToElementAndParent(params: AddClassToElementAndParentParams): void {
  params.childEl.addClass(params.className);
  if (params.isSingleValue) {
    params.childEl.parentElement?.addClass(params.className);
  }
}

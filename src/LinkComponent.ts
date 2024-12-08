import type { Component } from 'obsidian';
import type { ParseLinkResult } from 'obsidian-dev-utils/obsidian/Link';
import type { PropertyRenderContext } from 'obsidian-typings';

import { around } from 'monkey-around';
import { parseLink } from 'obsidian-dev-utils/obsidian/Link';

export interface LinkComponent extends Component {
  ctx: PropertyRenderContext;
  getDisplayText(): string;
  getLinkText(): string;
  inputEl: HTMLElement;
  isWikilink(): boolean;
  linkEl: HTMLElement;
  linkTextEl: HTMLElement;
  render(): void;
  value: string | undefined;
}

export function patchLinkComponentProto(linkComponentProto: LinkComponent): () => void {
  return around(linkComponentProto, {
    getDisplayText: () => function (this: LinkComponent): string {
      return getDisplayText(this);
    },
    getLinkText: () => function (this: LinkComponent): string {
      return getLinkText(this);
    },
    isWikilink: () => function (this: LinkComponent): boolean {
      return isWikilink(this);
    },
    render: (next: () => void) => function (this: LinkComponent): void {
      render(this, next);
    }
  });
}

function getDisplayText(linkComponent: LinkComponent): string {
  const parseLinkResult = getParseLinkResult(linkComponent);
  return parseLinkResult?.alias ?? parseLinkResult?.url ?? linkComponent.value ?? '';
}

function getLinkText(linkComponent: LinkComponent): string {
  const parseLinkResult = getParseLinkResult(linkComponent);
  return parseLinkResult?.url ?? linkComponent.value ?? '';
}

function getParseLinkResult(component: LinkComponent, useValue = false): null | ParseLinkResult {
  const text = useValue ? component.value : component.inputEl.textContent;
  return parseLink(text ?? '');
}

function isWikilink(linkComponent: LinkComponent): boolean {
  const parseLinkResult = getParseLinkResult(linkComponent);
  return !!parseLinkResult && (parseLinkResult.isWikilink || !parseLinkResult.isExternal);
}

function render(linkComponent: LinkComponent, next: () => void): void {
  const parseLinkResult = getParseLinkResult(linkComponent, true);
  if (parseLinkResult?.isExternal) {
    linkComponent.value = parseLinkResult.url;
  }
  next.call(linkComponent);
}

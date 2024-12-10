import type { Component } from 'obsidian';
import type { ParseLinkResult } from 'obsidian-dev-utils/obsidian/Link';
import type { PropertyRenderContext } from 'obsidian-typings';

import { around } from 'monkey-around';
import { parseLink } from 'obsidian-dev-utils/obsidian/Link';

export interface TextPropertyComponent extends Component {
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

export function patchTextPropertyComponentProto(textPropertyComponentProto: TextPropertyComponent): () => void {
  return around(textPropertyComponentProto, {
    getDisplayText: () => function (this: TextPropertyComponent): string {
      return getDisplayText(this);
    },
    getLinkText: () => function (this: TextPropertyComponent): string {
      return getLinkText(this);
    },
    isWikilink: () => function (this: TextPropertyComponent): boolean {
      return isWikilink(this);
    },
    render: (next: () => void) => function (this: TextPropertyComponent): void {
      render(this, next);
    }
  });
}

function getDisplayText(textPropertyComponent: TextPropertyComponent): string {
  const parseLinkResult = getParseLinkResult(textPropertyComponent);
  return parseLinkResult?.alias ?? parseLinkResult?.url ?? textPropertyComponent.value ?? '';
}

function getLinkText(textPropertyComponent: TextPropertyComponent): string {
  const parseLinkResult = getParseLinkResult(textPropertyComponent);
  return parseLinkResult?.url ?? textPropertyComponent.value ?? '';
}

function getParseLinkResult(textPropertyComponent: TextPropertyComponent, useValue = false): null | ParseLinkResult {
  const text = useValue ? textPropertyComponent.value : textPropertyComponent.inputEl.textContent;
  return parseLink(text ?? '');
}

function isWikilink(textPropertyComponent: TextPropertyComponent): boolean {
  const parseLinkResult = getParseLinkResult(textPropertyComponent);
  return !!parseLinkResult && (parseLinkResult.isWikilink || !parseLinkResult.isExternal);
}

function render(textPropertyComponent: TextPropertyComponent, next: () => void): void {
  const parseLinkResult = getParseLinkResult(textPropertyComponent, true);
  if (parseLinkResult?.isExternal) {
    textPropertyComponent.value = parseLinkResult.url;
  }
  next.call(textPropertyComponent);
}

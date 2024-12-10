import type { Component } from 'obsidian';

import { around } from 'monkey-around';
import { parseLink } from 'obsidian-dev-utils/obsidian/Link';

export interface MultiSelectComponent extends Component {
  renderValues(): void;
  rootEl: HTMLElement;
  values: string[];
}

export interface MultiTextPropertyComponent extends Component {
  containerEl: HTMLElement;
  multiselect: MultiSelectComponent;
}

export function patchMultiSelectComponentProto(multiSelectComponentProto: MultiSelectComponent): () => void {
  return around(multiSelectComponentProto, {
    renderValues: (next: () => void) => function (this: MultiSelectComponent) {
      renderValues(this, next);
    }
  });
}

function renderValues(multiSelectComponent: MultiSelectComponent, next: () => void): void {
  const aliases: string[] = [];
  multiSelectComponent.values = multiSelectComponent.values.map((value) => {
    const parseLinkResult = parseLink(value);
    aliases.push(parseLinkResult?.alias ?? parseLinkResult?.url ?? value);

    if (!parseLinkResult || parseLinkResult.isWikilink) {
      return value;
    }

    if (!parseLinkResult.isExternal) {
      return `[[${parseLinkResult.url}]]`;
    }

    return parseLinkResult.url;
  });
  next.call(multiSelectComponent);
  const renderedItemEls = Array.from(multiSelectComponent.rootEl.querySelectorAll('.multi-select-pill-content'));
  for (let i = 0; i < renderedItemEls.length; i++) {
    renderedItemEls[i]?.setText(aliases[i] ?? '');
  }
}

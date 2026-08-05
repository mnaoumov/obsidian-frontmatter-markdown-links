import type { BasesControl } from '@obsidian-typings/obsidian-public-latest';
import type { App } from 'obsidian';

import { castTo } from 'obsidian-dev-utils/object-utils';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { StringValueRenderToPatchComponent } from './string-value-render-to-patch-component.ts';

type GetFirstLinkpathDestination = App['metadataCache']['getFirstLinkpathDest'];
type RenderToFunction = (this: StringValueLike, containerEl: HTMLElement) => void;

interface RenderToPrototype {
  renderTo: RenderToFunction;
  toString(this: StringValueLike): string;
}

interface StringValueLike {
  data: string;
}

let loadedComponent: null | StringValueRenderToPatchComponent = null;

afterEach(() => {
  loadedComponent?.unload();
  loadedComponent = null;
  vi.restoreAllMocks();
});

function createPrototype(): RenderToPrototype {
  return {
    renderTo: vi.fn(function renderTo(this: StringValueLike, containerEl: HTMLElement): void {
      containerEl.setText(this.data);
    }),
    toString(this: StringValueLike): string {
      return this.data;
    }
  };
}

function createStringValue(prototype: RenderToPrototype, data: string): StringValueLike {
  const stringValue = castTo<StringValueLike>(Object.create(prototype));
  stringValue.data = data;
  return stringValue;
}

function loadPatch(prototype: RenderToPrototype, getFirstLinkpathDestination: GetFirstLinkpathDestination = vi.fn().mockReturnValue(null)): void {
  const app = strictProxy<App>({
    metadataCache: {
      // eslint-disable-next-line unicorn/name-replacements -- `getFirstLinkpathDest` is an Obsidian `MetadataCache` method name.
      getFirstLinkpathDest: getFirstLinkpathDestination
    },
    workspace: {
      getActiveFile: vi.fn().mockReturnValue(null)
    }
  });
  const component = new StringValueRenderToPatchComponent({
    app,
    stringValue: castTo<BasesControl>(createStringValue(prototype, 'text'))
  });
  component.load();
  loadedComponent = component;
}

describe('StringValueRenderToPatchComponent', () => {
  it('should leave the native plain-text rendering untouched for a string with no links', () => {
    const prototype = createPrototype();
    const originalRenderTo = prototype.renderTo;
    loadPatch(prototype);

    const containerEl = createDiv();
    castTo<RenderToFunction>(prototype.renderTo).call(createStringValue(prototype, 'no links here'), containerEl);

    expect(originalRenderTo).toHaveBeenCalledTimes(1);
    expect(containerEl.textContent).toBe('no links here');
    expect(containerEl.querySelector('[data-frontmatter-markdown-links-link-data]')).toBeNull();
  });

  it('should re-render embedded wikilinks as internal links for mixed text', () => {
    const prototype = createPrototype();
    loadPatch(prototype);

    const containerEl = createDiv();
    castTo<RenderToFunction>(prototype.renderTo).call(createStringValue(prototype, 'text [[target]]'), containerEl);

    const linkEl = containerEl.querySelector('[data-frontmatter-markdown-links-link-data]');
    expect(linkEl?.classList.contains('internal-link')).toBe(true);
    expect(containerEl.textContent).toContain('text ');
  });
});

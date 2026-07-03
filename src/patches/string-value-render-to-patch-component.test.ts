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

type GetFirstLinkpathDest = App['metadataCache']['getFirstLinkpathDest'];
type RenderToFn = (this: StringValueLike, containerEl: HTMLElement) => void;

interface RenderToProto {
  renderTo: RenderToFn;
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

function createProto(): RenderToProto {
  return {
    renderTo: vi.fn(function renderTo(this: StringValueLike, containerEl: HTMLElement): void {
      containerEl.setText(this.data);
    }),
    toString(this: StringValueLike): string {
      return this.data;
    }
  };
}

function createStringValue(proto: RenderToProto, data: string): StringValueLike {
  const stringValue = castTo<StringValueLike>(Object.create(proto));
  stringValue.data = data;
  return stringValue;
}

function loadPatch(proto: RenderToProto, getFirstLinkpathDest: GetFirstLinkpathDest = vi.fn().mockReturnValue(null)): void {
  const app = strictProxy<App>({
    metadataCache: {
      getFirstLinkpathDest
    },
    workspace: {
      getActiveFile: vi.fn().mockReturnValue(null)
    }
  });
  const component = new StringValueRenderToPatchComponent({
    app,
    stringValue: castTo<BasesControl>(createStringValue(proto, 'text'))
  });
  component.load();
  loadedComponent = component;
}

describe('StringValueRenderToPatchComponent', () => {
  it('should leave the native plain-text rendering untouched for a string with no links', () => {
    const proto = createProto();
    const originalRenderTo = proto.renderTo;
    loadPatch(proto);

    const containerEl = createDiv();
    castTo<RenderToFn>(proto.renderTo).call(createStringValue(proto, 'no links here'), containerEl);

    expect(originalRenderTo).toHaveBeenCalledTimes(1);
    expect(containerEl.textContent).toBe('no links here');
    expect(containerEl.querySelector('[data-frontmatter-markdown-links-link-data]')).toBeNull();
  });

  it('should re-render embedded wikilinks as internal links for mixed text', () => {
    const proto = createProto();
    loadPatch(proto);

    const containerEl = createDiv();
    castTo<RenderToFn>(proto.renderTo).call(createStringValue(proto, 'text [[target]]'), containerEl);

    const linkEl = containerEl.querySelector('[data-frontmatter-markdown-links-link-data]');
    expect(linkEl?.classList.contains('internal-link')).toBe(true);
    expect(containerEl.textContent).toContain('text ');
  });
});

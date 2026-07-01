import type { BasesList } from '@obsidian-typings/obsidian-public-latest';

import { castTo } from 'obsidian-dev-utils/object-utils';
import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { LinkFixer } from '../link-fixer.ts';
import { BasesListRenderToPatchComponent } from './bases-list-render-to-patch-component.ts';

type RenderToFn = (this: unknown, containerEl: HTMLElement) => unknown;

let loadedComponent: BasesListRenderToPatchComponent | null = null;

afterEach(() => {
  loadedComponent?.unload();
  loadedComponent = null;
  vi.restoreAllMocks();
});

describe('BasesListRenderToPatchComponent', () => {
  it('should call the original renderTo and then fix external links in the container', () => {
    const originalRenderTo = vi.fn();
    const proto = { renderTo: originalRenderTo };
    const basesList = castTo<BasesList>(Object.create(proto));
    const linkFixer = new LinkFixer();
    const fixExternalLinksSpy = vi.spyOn(linkFixer, 'fixExternalLinks');

    const component = new BasesListRenderToPatchComponent({
      basesList,
      linkFixer
    });
    component.load();
    loadedComponent = component;

    const containerEl = createDiv();
    castTo<RenderToFn>(proto.renderTo).call(basesList, containerEl);

    expect(originalRenderTo).toHaveBeenCalledTimes(1);
    expect(fixExternalLinksSpy).toHaveBeenCalledWith(containerEl);
  });
});

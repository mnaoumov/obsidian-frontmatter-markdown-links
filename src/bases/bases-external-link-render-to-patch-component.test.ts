import type { BasesExternalLink } from '@obsidian-typings/obsidian-public-latest';

import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { BasesExternalLinkRenderToPatchComponent } from './bases-external-link-render-to-patch-component.ts';
import { LinkFixer } from './link-fixer.ts';

type RenderToFunction = (this: unknown, containerEl: HTMLElement) => unknown;

let loadedComponent: BasesExternalLinkRenderToPatchComponent | null = null;

afterEach(() => {
  loadedComponent?.unload();
  loadedComponent = null;
  vi.restoreAllMocks();
});

describe('BasesExternalLinkRenderToPatchComponent', () => {
  it('should call the original renderTo and then fix external links in the container', () => {
    const originalRenderTo = vi.fn();
    const prototype = { renderTo: originalRenderTo };
    const basesExternalLink = castTo<BasesExternalLink>(Object.create(prototype));
    const linkFixer = new LinkFixer();
    const fixExternalLinksSpy = vi.spyOn(linkFixer, 'fixExternalLinks');

    const component = new BasesExternalLinkRenderToPatchComponent({
      basesExternalLink,
      linkFixer
    });
    component.load();
    loadedComponent = component;

    const containerEl = createDiv();
    castTo<RenderToFunction>(prototype.renderTo).call(basesExternalLink, containerEl);

    expect(originalRenderTo).toHaveBeenCalledTimes(1);
    expect(fixExternalLinksSpy).toHaveBeenCalledWith(containerEl);
  });
});

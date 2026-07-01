import type { BasesExternalLink } from '@obsidian-typings/obsidian-public-latest';

import { castTo } from 'obsidian-dev-utils/object-utils';
import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { LinkFixer } from '../link-fixer.ts';
import { BasesExternalLinkRenderToPatchComponent } from './bases-external-link-render-to-patch-component.ts';

type RenderToFn = (this: unknown, containerEl: HTMLElement) => unknown;

let loadedComponent: BasesExternalLinkRenderToPatchComponent | null = null;

afterEach(() => {
  loadedComponent?.unload();
  loadedComponent = null;
  vi.restoreAllMocks();
});

describe('BasesExternalLinkRenderToPatchComponent', () => {
  it('should call the original renderTo and then fix external links in the container', () => {
    const originalRenderTo = vi.fn();
    const proto = { renderTo: originalRenderTo };
    const basesExternalLink = castTo<BasesExternalLink>(Object.create(proto));
    const linkFixer = new LinkFixer();
    const fixExternalLinksSpy = vi.spyOn(linkFixer, 'fixExternalLinks');

    const component = new BasesExternalLinkRenderToPatchComponent({
      basesExternalLink,
      linkFixer
    });
    component.load();
    loadedComponent = component;

    const containerEl = activeDocument.createDiv();
    castTo<RenderToFn>(proto.renderTo).call(basesExternalLink, containerEl);

    expect(originalRenderTo).toHaveBeenCalledTimes(1);
    expect(fixExternalLinksSpy).toHaveBeenCalledWith(containerEl);
  });
});

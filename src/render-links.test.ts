import type { App } from 'obsidian';
import type { ParseLinkResult } from 'obsidian-dev-utils/obsidian/parse-link';

import { castTo } from 'obsidian-dev-utils/object-utils';
import { parseLinks } from 'obsidian-dev-utils/obsidian/parse-link';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';
import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  renderLinkChild,
  renderStringValueLinks
} from './render-links.ts';

type GetFirstLinkpathDest = App['metadataCache']['getFirstLinkpathDest'];

afterEach(() => {
  vi.restoreAllMocks();
});

function createApp(getFirstLinkpathDest: GetFirstLinkpathDest = vi.fn().mockReturnValue(null)): App {
  return strictProxy<App>({
    metadataCache: {
      getFirstLinkpathDest
    },
    workspace: {
      getActiveFile: vi.fn().mockReturnValue(null)
    }
  });
}

function firstLink(value: string): ParseLinkResult {
  return ensureNonNullable(parseLinks(value)[0]);
}

describe('renderLinkChild', () => {
  it('should render an external link with the external-link class', () => {
    const childEl = createDiv();
    renderLinkChild({
      app: createApp(),
      childEl,
      parseLinkResult: firstLink('[ext](https://example.com)'),
      shouldClassParent: false
    });

    expect(childEl.classList.contains('external-link')).toBe(true);
    expect(childEl.querySelector('span')?.textContent).toBe('ext');
    expect(childEl.getAttribute('title')).toBe('https://example.com');
    expect(childEl.dataset['frontmatterMarkdownLinksLinkData']).toBeTruthy();
  });

  it('should render a resolved internal link without the is-unresolved class', () => {
    const childEl = createDiv();
    renderLinkChild({
      app: createApp(vi.fn().mockReturnValue(castTo<ReturnType<GetFirstLinkpathDest>>({ path: 'target.md' }))),
      childEl,
      parseLinkResult: firstLink('[note](target.md)'),
      shouldClassParent: false
    });

    expect(childEl.classList.contains('internal-link')).toBe(true);
    expect(childEl.classList.contains('is-unresolved')).toBe(false);
  });

  it('should add the is-unresolved class when an internal link does not resolve', () => {
    const childEl = createDiv();
    renderLinkChild({
      app: createApp(vi.fn().mockReturnValue(null)),
      childEl,
      parseLinkResult: firstLink('[note](target.md)'),
      shouldClassParent: false
    });

    expect(childEl.classList.contains('is-unresolved')).toBe(true);
  });

  it('should also class the parent element when shouldClassParent is true', () => {
    const parentEl = createDiv();
    const childEl = parentEl.createDiv();
    renderLinkChild({
      app: createApp(vi.fn().mockReturnValue(null)),
      childEl,
      parseLinkResult: firstLink('[note](target.md)'),
      shouldClassParent: true
    });

    expect(parentEl.classList.contains('internal-link')).toBe(true);
    expect(parentEl.classList.contains('is-unresolved')).toBe(true);
  });

  it('should not class the parent element when shouldClassParent is false', () => {
    const parentEl = createDiv();
    const childEl = parentEl.createDiv();
    renderLinkChild({
      app: createApp(vi.fn().mockReturnValue(null)),
      childEl,
      parseLinkResult: firstLink('[note](target.md)'),
      shouldClassParent: false
    });

    expect(parentEl.classList.contains('internal-link')).toBe(false);
  });
});

describe('renderStringValueLinks', () => {
  it('should return false and leave the container untouched when there are no links', () => {
    const containerEl = createDiv();
    const wasRendered = renderStringValueLinks({
      app: createApp(),
      containerEl,
      value: 'plain text'
    });

    expect(wasRendered).toBe(false);
    expect(containerEl.childElementCount).toBe(0);
    expect(containerEl.querySelector('[data-frontmatter-markdown-links-link-data]')).toBeNull();
  });

  it('should render leading text and the embedded wikilink', () => {
    const containerEl = createDiv();
    const wasRendered = renderStringValueLinks({
      app: createApp(),
      containerEl,
      value: 'text [[target]]'
    });

    expect(wasRendered).toBe(true);
    const linkEl = containerEl.querySelector('[data-frontmatter-markdown-links-link-data]');
    expect(linkEl?.classList.contains('internal-link')).toBe(true);
    expect(containerEl.textContent).toContain('text ');
    expect(containerEl.textContent).toContain('target');
  });

  it('should render trailing text after a leading link', () => {
    const containerEl = createDiv();
    const wasRendered = renderStringValueLinks({
      app: createApp(),
      containerEl,
      value: '[[target]] trailing'
    });

    expect(wasRendered).toBe(true);
    expect(containerEl.textContent).toContain('trailing');
    expect(containerEl.querySelector('.internal-link')).not.toBeNull();
  });

  it('should render multiple embedded links with surrounding text', () => {
    const containerEl = createDiv();
    const wasRendered = renderStringValueLinks({
      app: createApp(),
      containerEl,
      value: 'a [x](x.md) b [y](y.md) c'
    });

    expect(wasRendered).toBe(true);
    expect(containerEl.querySelectorAll('[data-frontmatter-markdown-links-link-data]').length).toBe(2);
    expect(containerEl.textContent).toContain('a ');
    expect(containerEl.textContent).toContain(' b ');
    expect(containerEl.textContent).toContain(' c');
  });

  it('should render a value that is a single whole link', () => {
    const containerEl = createDiv();
    const wasRendered = renderStringValueLinks({
      app: createApp(),
      containerEl,
      value: '[note](target.md)'
    });

    expect(wasRendered).toBe(true);
    expect(containerEl.querySelectorAll('[data-frontmatter-markdown-links-link-data]').length).toBe(1);
    expect(containerEl.querySelector('span')?.textContent).toBe('note');
  });
});

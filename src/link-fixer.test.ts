import type { ParseLinkResult } from 'obsidian-dev-utils/obsidian/link';

import { castTo } from 'obsidian-dev-utils/object-utils';
import {
  describe,
  expect,
  it
} from 'vitest';

import {
  EXTERNAL_LINK_PREFIX,
  LinkFixer
} from './link-fixer.ts';

interface AnchorInContainer {
  aEl: HTMLAnchorElement;
  containerEl: HTMLDivElement;
}

interface LinkFixerInternals {
  externalLinks: Map<number, ParseLinkResult>;
}

function createAnchorIn(href: string): AnchorInContainer {
  const containerEl = createDiv();
  const aEl = createEl('a');
  aEl.href = href;
  containerEl.appendChild(aEl);
  return { aEl, containerEl };
}

describe('LinkFixer', () => {
  describe('patchLink', () => {
    it('should return non-string, non-array values unchanged', () => {
      const linkFixer = new LinkFixer();

      expect(linkFixer.patchLink(42)).toBe(42);
      expect(linkFixer.patchLink(null)).toBeNull();
      expect(linkFixer.patchLink(undefined)).toBeUndefined();
    });

    it('should return a plain string unchanged when it is not a link', () => {
      const linkFixer = new LinkFixer();

      expect(linkFixer.patchLink('plain text')).toBe('plain text');
    });

    it('should return a wikilink unchanged', () => {
      const linkFixer = new LinkFixer();

      expect(linkFixer.patchLink('[[some/note]]')).toBe('[[some/note]]');
    });

    it('should convert an internal markdown link with alias to a wikilink', () => {
      const linkFixer = new LinkFixer();

      expect(linkFixer.patchLink('[alias](some/note.md)')).toBe('[[some/note.md|alias]]');
    });

    it('should convert an internal markdown link without alias to a wikilink without pipe', () => {
      const linkFixer = new LinkFixer();

      expect(linkFixer.patchLink('[](some/note.md)')).toBe('[[some/note.md]]');
    });

    it('should return an external url without alias unchanged', () => {
      const linkFixer = new LinkFixer();

      expect(linkFixer.patchLink('https://example.com')).toBe('https://example.com');
    });

    it('should register an external link with alias and return a placeholder URL', () => {
      const linkFixer = new LinkFixer();

      const result = linkFixer.patchLink('[Example](https://example.com)') as string;

      expect(result).toBe(`${EXTERNAL_LINK_PREFIX}1`);
    });

    it('should assign sequential IDs to multiple external links with aliases', () => {
      const linkFixer = new LinkFixer();

      const result1 = linkFixer.patchLink('[Link1](https://example1.com)') as string;
      const result2 = linkFixer.patchLink('[Link2](https://example2.com)') as string;

      expect(result1).toBe(`${EXTERNAL_LINK_PREFIX}1`);
      expect(result2).toBe(`${EXTERNAL_LINK_PREFIX}2`);
    });

    it('should map array values recursively', () => {
      const linkFixer = new LinkFixer();

      const result = linkFixer.patchLink(['plain', '[[wiki]]', 'https://test.com']);

      expect(result).toEqual(['plain', '[[wiki]]', 'https://test.com']);
    });
  });

  describe('fixExternalLinks', () => {
    it('should leave anchors alone when href does not match the external link prefix', () => {
      const linkFixer = new LinkFixer();
      const { aEl, containerEl } = createAnchorIn('https://other.com/link');

      linkFixer.fixExternalLinks(containerEl);

      expect(aEl.href).toBe('https://other.com/link');
    });

    it('should stop processing when the link ID is not found in the externalLinks map', () => {
      const linkFixer = new LinkFixer();
      const { aEl, containerEl } = createAnchorIn(`${EXTERNAL_LINK_PREFIX}999`);
      const hrefBefore = aEl.href;

      linkFixer.fixExternalLinks(containerEl);

      expect(aEl.href).toBe(hrefBefore);
    });

    it('should restore href and text for a known external link with alias', () => {
      const linkFixer = new LinkFixer();
      const placeholder = linkFixer.patchLink('[Click Here](https://example.com)') as string;
      const { aEl, containerEl } = createAnchorIn(placeholder);

      linkFixer.fixExternalLinks(containerEl);

      expect(aEl.href).toBe('https://example.com/');
      expect(aEl.textContent).toBe('Click Here');
    });

    it('should use the URL as the anchor text when an external link has no alias', () => {
      const linkFixer = new LinkFixer();
      castTo<LinkFixerInternals>(linkFixer).externalLinks.set(1, {
        endOffset: 0,
        isEmbed: false,
        isExternal: true,
        isWikilink: false,
        raw: 'https://example.com',
        startOffset: 0,
        url: 'https://example.com'
      });
      const { aEl, containerEl } = createAnchorIn(`${EXTERNAL_LINK_PREFIX}1`);

      linkFixer.fixExternalLinks(containerEl);

      expect(aEl.textContent).toBe('https://example.com');
    });
  });
});

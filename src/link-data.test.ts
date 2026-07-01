import {
  describe,
  expect,
  it
} from 'vitest';

import {
  attachLinkData,
  getDataAttributes,
  getLinkData
} from './link-data.ts';

type LinkData = NonNullable<ReturnType<typeof getLinkData>>;

describe('attachLinkData', () => {
  it('should set the data attribute on the element', () => {
    const el = createDiv();
    const linkData: LinkData = { isExternalUrl: false, isWikilink: true, url: 'some/note' };

    attachLinkData(el, linkData);

    expect(el.dataset['frontmatterMarkdownLinksLinkData']).toBe(JSON.stringify(linkData));
  });

  it('should serialize isExternalUrl true', () => {
    const el = createDiv();
    const linkData: LinkData = { isExternalUrl: true, isWikilink: false, url: 'https://example.com' };

    attachLinkData(el, linkData);

    const parsed = JSON.parse(el.dataset['frontmatterMarkdownLinksLinkData'] ?? '') as LinkData;
    expect(parsed.isExternalUrl).toBe(true);
  });
});

describe('getDataAttributes', () => {
  it('should return empty object when linkData is null', () => {
    const result = getDataAttributes(null);

    expect(result).toEqual({});
  });

  it('should return attribute name and value when linkData is provided', () => {
    const linkData: LinkData = { isExternalUrl: false, isWikilink: false, url: 'some/path' };

    const result = getDataAttributes(linkData);

    expect(Object.keys(result)).toHaveLength(1);
    const attrName = Object.keys(result)[0];
    expect(attrName).toContain('frontmatter-markdown-links-link-data');
  });

  it('should serialize the link data as JSON in the attribute value', () => {
    const linkData: LinkData = { isExternalUrl: true, isWikilink: false, url: 'https://example.com' };

    const result = getDataAttributes(linkData);

    const attrName = Object.keys(result)[0];
    const parsed = JSON.parse(result[attrName ?? ''] ?? '') as LinkData;
    expect(parsed.isExternalUrl).toBe(true);
    expect(parsed.url).toBe('https://example.com');
  });
});

describe('getLinkData', () => {
  it('should return null when element has no link data ancestor', () => {
    const el = createSpan();
    activeDocument.body.appendChild(el);

    const result = getLinkData(el);

    expect(result).toBeNull();
    el.remove();
  });

  it('should return null when closest ancestor has no dataset value', () => {
    const parent = createDiv();
    parent.setAttribute('data-frontmatter-markdown-links-link-data', '');
    const child = createSpan();
    parent.appendChild(child);
    activeDocument.body.appendChild(parent);

    const result = getLinkData(child);

    expect(result).toBeNull();
    parent.remove();
  });

  it('should return parsed link data from ancestor', () => {
    const parent = createDiv();
    const linkData: LinkData = { isExternalUrl: false, isWikilink: true, url: 'target/note' };
    parent.setAttribute('data-frontmatter-markdown-links-link-data', JSON.stringify(linkData));
    const child = createSpan();
    parent.appendChild(child);
    activeDocument.body.appendChild(parent);

    const result = getLinkData(child);

    expect(result).toEqual(linkData);
    parent.remove();
  });

  it('should return link data from the element itself when it has the attribute', () => {
    const el = createDiv();
    const linkData: LinkData = { isExternalUrl: true, isWikilink: false, url: 'https://test.com' };
    el.setAttribute('data-frontmatter-markdown-links-link-data', JSON.stringify(linkData));
    activeDocument.body.appendChild(el);

    const result = getLinkData(el);

    expect(result).toEqual(linkData);
    el.remove();
  });
});

import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';

interface Dataset {
  // eslint-disable-next-line typescript-dev-toolkit/readonly-interface-members -- The link cache is populated and refreshed on the patched element.
  frontmatterMarkdownLinksLinkData: string;
}

interface LinkData {
  readonly isExternalUrl: boolean;
  readonly isWikilink: boolean;
  readonly url: string;
}

export function attachLinkData(el: HTMLElement, linkData: LinkData): void {
  const dataset = el.dataset as Partial<Dataset>;
  dataset.frontmatterMarkdownLinksLinkData = JSON.stringify(linkData);
}

export function getDataAttributes(linkData: LinkData | null): Record<string, string> {
  if (!linkData) {
    return {};
  }

  const div = createDiv();
  attachLinkData(div, linkData);
  const attr = ensureNonNullable(div.attributes[0]);

  return {
    [attr.name]: attr.value
  };
}

export function getLinkData(el: HTMLElement): LinkData | null {
  const parentEl = el.closest('[data-frontmatter-markdown-links-link-data]');
  if (!(parentEl instanceof HTMLElement)) {
    return null;
  }

  const dataset = parentEl.dataset as Partial<Dataset>;
  return dataset.frontmatterMarkdownLinksLinkData ? (JSON.parse(dataset.frontmatterMarkdownLinksLinkData) as LinkData) : null;
}

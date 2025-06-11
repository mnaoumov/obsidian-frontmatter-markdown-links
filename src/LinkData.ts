export interface LinkData {
  isExternalUrl: boolean;
  isWikilink: boolean;
  url: string;
}

interface Dataset {
  frontmatterMarkdownLinksLinkData: string;
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
  const attr = div.attributes[0];
  if (!attr) {
    return {};
  }

  return {
    [attr.name]: attr.value
  };
}

export function getLinkData(el: HTMLElement): LinkData | null {
  const dataset = el.dataset as Partial<Dataset>;
  if (!dataset.frontmatterMarkdownLinksLinkData) {
    return null;
  }

  return JSON.parse(dataset.frontmatterMarkdownLinksLinkData) as object as LinkData;
}

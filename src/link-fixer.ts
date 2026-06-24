import type { ParseLinkResult } from 'obsidian-dev-utils/obsidian/link';

import { parseLink } from 'obsidian-dev-utils/obsidian/link';

export const EXTERNAL_LINK_PREFIX = 'https://EXTERNAL_LINK_PREFIX.com/';

export class LinkFixer {
  private externalLinkMaxId = 0;
  private readonly externalLinks = new Map<number, ParseLinkResult>();

  public fixExternalLinks(containerEl: HTMLElement): void {
    const aEls = containerEl.querySelectorAll<HTMLAnchorElement>('a');

    for (const aEl of aEls) {
      if (!aEl.href.toLowerCase().startsWith(EXTERNAL_LINK_PREFIX.toLowerCase())) {
        continue;
      }

      const linkId = Number(aEl.href.slice(EXTERNAL_LINK_PREFIX.length));
      const parseLinkResult = this.externalLinks.get(linkId);
      if (!parseLinkResult) {
        return;
      }

      this.externalLinks.delete(linkId);

      aEl.href = parseLinkResult.url;
      aEl.setText(parseLinkResult.alias ?? parseLinkResult.url);
    }
  }

  public patchLink(value: unknown): unknown {
    if (typeof value === 'string') {
      const parseLinkResult = parseLink(value);
      if (!parseLinkResult || parseLinkResult.isWikilink) {
        return value;
      }

      if (parseLinkResult.isExternal) {
        if (parseLinkResult.alias === undefined) {
          return parseLinkResult.url;
        }
        this.externalLinkMaxId++;
        this.externalLinks.set(this.externalLinkMaxId, parseLinkResult);
        return `${EXTERNAL_LINK_PREFIX}${String(this.externalLinkMaxId)}`;
      }

      return parseLinkResult.alias ? `[[${parseLinkResult.url}|${parseLinkResult.alias}]]` : `[[${parseLinkResult.url}]]`;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.patchLink(item));
    }

    return value;
  }
}

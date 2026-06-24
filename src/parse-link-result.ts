import type { ParseLinkResult } from 'obsidian-dev-utils/obsidian/link';

export function extractDisplayText(parseLinkResult: ParseLinkResult): string {
  return parseLinkResult.alias ?? parseLinkResult.url.split('#').map((part) => part.trim()).join(' > ');
}

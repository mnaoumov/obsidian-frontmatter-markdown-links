import type { ParseLinkResult } from '@mnaoumov/obsidian-lib/parse-link';

export function extractDisplayText(parseLinkResult: ParseLinkResult): string {
  return parseLinkResult.alias ?? parseLinkResult.url.split('#').map((part) => part.trim()).join(' > ');
}

import type { App } from 'obsidian';
import type { ParseLinkResult } from 'obsidian-dev-utils/obsidian/Link';

import { MarkdownView } from 'obsidian';

export function extractDisplayText(parseLinkResult: ParseLinkResult): string {
  return parseLinkResult.alias ?? parseLinkResult.url.split('#').map((part) => part.trim()).join(' > ');
}

export function isSourceMode(app: App): boolean {
  const view = app.workspace.getActiveViewOfType(MarkdownView);
  if (!view) {
    return false;
  }

  if (view.getMode() !== 'source') {
    return false;
  }

  const state = view.getState();
  return !!state['source'];
}

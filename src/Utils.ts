import type { App } from 'obsidian';

import { MarkdownView } from 'obsidian';

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

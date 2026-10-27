import {
  App,
  MarkdownView
} from 'obsidian';

export function isSourceMode(app: App): boolean {
  const view = app.workspace.getActiveViewOfType(MarkdownView);
  return view?.getMode() === 'source' && view.getState().source;
}

import type { App } from 'obsidian';
import type { ParseLinkResult } from 'obsidian-dev-utils/obsidian/parse-link';

import { splitSubpath } from 'obsidian-dev-utils/obsidian/link';
import { parseLinks } from 'obsidian-dev-utils/obsidian/parse-link';

import { attachLinkData } from './link-data.ts';
import { extractDisplayText } from './parse-link-result.ts';

interface AddClassToElementAndParentParams {
  readonly childEl: HTMLElement;
  readonly className: string;
  readonly shouldClassParent: boolean;
}

interface RenderLinkChildParams {
  readonly app: App;
  readonly childEl: HTMLElement;
  readonly parseLinkResult: ParseLinkResult;
  readonly shouldClassParent: boolean;
}

interface RenderStringValueLinksParams {
  readonly app: App;
  readonly containerEl: HTMLElement;
  readonly value: string;
}

/**
 * Renders a single parsed link into `childEl`: the display text, the `internal-link` /
 * `external-link` / `is-unresolved` classes, a title, and the link data the plugin's click/hover
 * handlers read.
 */
export function renderLinkChild(params: RenderLinkChildParams): void {
  const {
    app,
    childEl,
    parseLinkResult,
    shouldClassParent
  } = params;

  childEl.setText('');
  childEl.createSpan({ text: extractDisplayText(parseLinkResult) });
  if (parseLinkResult.isExternal) {
    childEl.addClass('external-link');
  } else {
    addClassToElementAndParent({
      childEl,
      className: 'internal-link',
      shouldClassParent
    });
    const resolvedLink = app.metadataCache.getFirstLinkpathDest(splitSubpath(parseLinkResult.url).linkPath, app.workspace.getActiveFile()?.path ?? '');
    if (!resolvedLink) {
      addClassToElementAndParent({
        childEl,
        className: 'is-unresolved',
        shouldClassParent
      });
    }
  }
  childEl.setAttribute('title', parseLinkResult.url);
  attachLinkData(childEl, {
    isExternalUrl: parseLinkResult.isExternal,
    isWikilink: parseLinkResult.isWikilink,
    url: parseLinkResult.url
  });
}

/**
 * Renders a string that may contain embedded links (e.g. `text [[link]]`) into `containerEl` as a
 * mix of plain-text spans and rendered link spans. Returns `true` when the string contained at
 * least one link and was rendered, or `false` when it contained none (so the caller can fall back
 * to the native plain-text rendering).
 */
export function renderStringValueLinks(params: RenderStringValueLinksParams): boolean {
  const {
    app,
    containerEl,
    value
  } = params;

  const parseLinkResults = parseLinks(value);
  if (parseLinkResults.length === 0) {
    return false;
  }

  containerEl.empty();

  let startOffset = 0;
  for (const parseLinkResult of parseLinkResults) {
    if (startOffset < parseLinkResult.startOffset) {
      containerEl.createSpan({ text: value.slice(startOffset, parseLinkResult.startOffset) });
    }

    const childEl = containerEl.createSpan();
    renderLinkChild({
      app,
      childEl,
      parseLinkResult,
      shouldClassParent: false
    });
    startOffset = parseLinkResult.endOffset;
  }

  if (startOffset < value.length) {
    containerEl.createSpan({ text: value.slice(startOffset) });
  }

  return true;
}

function addClassToElementAndParent(params: AddClassToElementAndParentParams): void {
  params.childEl.addClass(params.className);
  if (params.shouldClassParent) {
    params.childEl.parentElement?.addClass(params.className);
  }
}

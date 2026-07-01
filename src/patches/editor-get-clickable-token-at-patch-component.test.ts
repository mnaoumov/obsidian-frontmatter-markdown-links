import type { ClickableToken } from '@obsidian-typings/obsidian-public-latest';
import type {
  Editor,
  EditorPosition
} from 'obsidian';

import { castTo } from 'obsidian-dev-utils/object-utils';
import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { attachLinkData } from '../link-data.ts';
import { EditorGetClickableTokenAtPatchComponent } from './editor-get-clickable-token-at-patch-component.ts';

interface EditorCmHolder {
  cm: Editor['cm'];
}

interface EditorProto {
  getClickableTokenAt(this: unknown, pos: EditorPosition): unknown;
  offsetToPos(offset: number): EditorPosition;
  posToOffset(pos: EditorPosition): number;
}

type EditorWithCm = Editor & EditorCmHolder;

interface EditorWithProto {
  editor: Editor;
  proto: EditorProto;
}

type GetClickableTokenAtFn = (this: unknown, pos: EditorPosition) => unknown;

type LinkData = Parameters<typeof attachLinkData>[1];

let loadedComponent: EditorGetClickableTokenAtPatchComponent | null = null;

afterEach(() => {
  loadedComponent?.unload();
  loadedComponent = null;
  vi.restoreAllMocks();
});

function createEditor(node: Node, fallbackToken: ClickableToken | null): EditorWithProto {
  const proto: EditorProto = {
    getClickableTokenAt: vi.fn().mockReturnValue(fallbackToken),
    offsetToPos: vi.fn().mockReturnValue(createPos()),
    posToOffset: vi.fn().mockReturnValue(0)
  };
  const editor = Object.create(proto) as EditorWithCm;
  editor.cm = castTo<Editor['cm']>({
    domAtPos: vi.fn().mockReturnValue({ node }),
    posAtDOM: vi.fn().mockReturnValue(0)
  });
  return { editor, proto };
}

function createFrontmatterEl(): HTMLElement {
  const frontmatterEl = createDiv();
  frontmatterEl.addClass('cm-hmd-frontmatter');
  activeDocument.body.appendChild(frontmatterEl);
  return frontmatterEl;
}

function createLinkEl(frontmatterEl: HTMLElement, className: string, linkData: LinkData): HTMLElement {
  const linkEl = frontmatterEl.createDiv(className);
  attachLinkData(linkEl, linkData);
  return linkEl;
}

function createPos(): EditorPosition {
  return { ch: 0, line: 0 };
}

function invoke(proto: EditorProto, editor: Editor): unknown {
  return castTo<GetClickableTokenAtFn>(proto.getClickableTokenAt).call(editor, createPos());
}

function loadPatch(editor: Editor): void {
  const component = new EditorGetClickableTokenAtPatchComponent({ editor });
  component.load();
  loadedComponent = component;
}

function stubFindWithoutLinkEnd(frontmatterEl: HTMLElement, linkEl: HTMLElement): void {
  const linkEndSelector = '.cm-formatting-link-end';
  // The real Obsidian `find` returns `null` for the missing link-end element; the test-mocks `find` throws, so stub the return value.
  vi.spyOn(frontmatterEl, 'find').mockImplementation((selector: string) => {
    if (selector === linkEndSelector) {
      return castTo<HTMLElement>(null);
    }
    return linkEl;
  });
}

describe('EditorGetClickableTokenAtPatchComponent', () => {
  it('should return the token from fallback when it exists', () => {
    const token: ClickableToken = { end: createPos(), start: createPos(), text: 'x', type: 'internal-link' };
    const node = createDiv();
    const { editor, proto } = createEditor(node, token);
    loadPatch(editor);

    const result = invoke(proto, editor);

    expect(result).toBe(token);
  });

  it('should return null when there is no frontmatter element', () => {
    const node = createDiv();
    const { editor, proto } = createEditor(node, null);
    loadPatch(editor);

    const result = invoke(proto, editor);

    expect(result).toBeNull();
  });

  it('should use parentElement when the node is not an HTMLElement', () => {
    const parent = createDiv();
    const textNode = activeDocument.createTextNode('text');
    parent.appendChild(textNode);
    const { editor, proto } = createEditor(textNode, null);
    loadPatch(editor);

    const result = invoke(proto, editor);

    expect(result).toBeNull();
  });

  it('should return null when no link element is found in the frontmatter', () => {
    const frontmatterEl = createFrontmatterEl();
    // The real Obsidian `find` returns `null` when nothing matches; the test-mocks `find` throws, so stub the return value.
    vi.spyOn(frontmatterEl, 'find').mockReturnValue(castTo<HTMLElement>(null));
    const { editor, proto } = createEditor(frontmatterEl, null);
    loadPatch(editor);

    const result = invoke(proto, editor);

    expect(result).toBeNull();
    frontmatterEl.remove();
  });

  it('should return null when the link element has no link data', () => {
    const frontmatterEl = createFrontmatterEl();
    const linkEl = frontmatterEl.createDiv('cm-hmd-internal-link');
    linkEl.setAttribute('data-frontmatter-markdown-links-link-data', '');
    const { editor, proto } = createEditor(frontmatterEl, null);
    loadPatch(editor);

    const result = invoke(proto, editor);

    expect(result).toBeNull();
    frontmatterEl.remove();
  });

  it('should build an internal-link clickable token using the formatting-link-end element', () => {
    const frontmatterEl = createFrontmatterEl();
    createLinkEl(frontmatterEl, 'cm-hmd-internal-link', { isExternalUrl: false, isWikilink: false, url: 'note.md' });
    frontmatterEl.createDiv('cm-formatting-link-end');
    const { editor, proto } = createEditor(frontmatterEl, null);
    loadPatch(editor);

    const result = castTo<ClickableToken | null>(invoke(proto, editor));

    expect(result?.type).toBe('internal-link');
    expect(result?.text).toBe('note.md');
    frontmatterEl.remove();
  });

  it('should build an external-link token and fall back to nextElementSibling when no link-end element exists', () => {
    const frontmatterEl = createFrontmatterEl();
    const linkEl = createLinkEl(frontmatterEl, 'cm-url', { isExternalUrl: true, isWikilink: false, url: 'https://example.com' });
    const siblingEl = frontmatterEl.createDiv('sibling');
    stubFindWithoutLinkEnd(frontmatterEl, linkEl);
    const { editor, proto } = createEditor(frontmatterEl, null);
    loadPatch(editor);

    const result = castTo<ClickableToken | null>(invoke(proto, editor));

    expect(result?.type).toBe('external-link');
    expect(siblingEl).toBe(linkEl.nextElementSibling);
    frontmatterEl.remove();
  });

  it('should keep start as end position when there is no end element', () => {
    const frontmatterEl = createFrontmatterEl();
    const linkEl = createLinkEl(frontmatterEl, 'cm-url', { isExternalUrl: true, isWikilink: false, url: 'https://example.com' });
    stubFindWithoutLinkEnd(frontmatterEl, linkEl);
    const { editor, proto } = createEditor(frontmatterEl, null);
    loadPatch(editor);

    const result = castTo<ClickableToken | null>(invoke(proto, editor));

    expect(result?.start).toEqual(result?.end);
    frontmatterEl.remove();
  });
});

import type {
  App,
  Menu as MenuType
} from 'obsidian';

import { castTo } from 'obsidian-dev-utils/object-utils';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  Menu,
  MenuItem
} from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { MenuShowAtMouseEventPatchComponent } from './menu-show-at-mouse-event-patch-component.ts';

interface LinkDataShape {
  isExternalUrl: boolean;
  isWikilink: boolean;
  url: string;
}

interface MenuItemsAccess {
  items: unknown[];
}

interface MenuItemSectionAccess {
  section: string;
}

type ShowAtMouseEventFn = (this: unknown, evt: MouseEvent) => unknown;

let loadedComponent: MenuShowAtMouseEventPatchComponent | null = null;

afterEach(() => {
  loadedComponent?.unload();
  loadedComponent = null;
  vi.restoreAllMocks();
});

function callShowAtMouseEvent(menu: MenuType, evt: MouseEvent): unknown {
  return castTo<ShowAtMouseEventFn>(Menu.prototype.showAtMouseEvent).call(menu, evt);
}

function createLinkTarget(linkData: LinkDataShape): HTMLElement {
  const target = createDiv();
  target.setAttribute('data-frontmatter-markdown-links-link-data', JSON.stringify(linkData));
  activeDocument.body.appendChild(target);
  return target;
}

function createMenu(items: unknown[] = []): MenuType {
  const menu = Menu.create2__();
  castTo<MenuItemsAccess>(menu).items = items;
  return castTo<MenuType>(menu);
}

function loadPatch(app: App): void {
  const component = new MenuShowAtMouseEventPatchComponent(app);
  component.load();
  loadedComponent = component;
}

describe('MenuShowAtMouseEventPatchComponent', () => {
  it('should call fallback when target is null', () => {
    const app = strictProxy<App>({});
    loadPatch(app);
    const menu = createMenu();
    const evt = castTo<MouseEvent>({ target: null });

    const result = callShowAtMouseEvent(menu, evt);

    expect(result).toBe(menu);
  });

  it('should call fallback when target has no link data', () => {
    const app = strictProxy<App>({});
    loadPatch(app);
    const menu = createMenu();
    const target = createDiv();
    const evt = castTo<MouseEvent>({ target });

    const result = callShowAtMouseEvent(menu, evt);

    expect(result).toBe(menu);
  });

  it('should fall back without adding a menu when an open-section item already exists', () => {
    const handleLinkContextMenu = vi.fn();
    const app = strictProxy<App>({
      workspace: {
        getActiveFile: vi.fn().mockReturnValue(null),
        handleLinkContextMenu
      }
    });
    loadPatch(app);

    const menu = createMenu();
    const openItem = MenuItem.create__(menu);
    castTo<MenuItemSectionAccess>(openItem).section = 'open';
    castTo<MenuItemsAccess>(menu).items = [openItem];

    const target = createLinkTarget({ isExternalUrl: false, isWikilink: false, url: 'note.md' });
    const evt = castTo<MouseEvent>({ target });

    callShowAtMouseEvent(menu, evt);

    expect(handleLinkContextMenu).not.toHaveBeenCalled();
    target.remove();
  });

  it('should add an external link context menu for external links', () => {
    const handleExternalLinkContextMenu = vi.fn();
    const app = strictProxy<App>({
      workspace: {
        handleExternalLinkContextMenu
      }
    });
    loadPatch(app);

    const menu = createMenu();
    const target = createLinkTarget({ isExternalUrl: true, isWikilink: false, url: 'https://example.com' });
    const evt = castTo<MouseEvent>({ target });

    callShowAtMouseEvent(menu, evt);

    expect(handleExternalLinkContextMenu).toHaveBeenCalledWith(menu, 'https://example.com');
    target.remove();
  });

  it('should add an internal link context menu for internal links', () => {
    const handleLinkContextMenu = vi.fn();
    const app = strictProxy<App>({
      workspace: {
        getActiveFile: vi.fn().mockReturnValue({ path: 'current.md' }),
        handleLinkContextMenu
      }
    });
    loadPatch(app);

    const menu = createMenu();
    const target = createLinkTarget({ isExternalUrl: false, isWikilink: false, url: 'note.md' });
    const evt = castTo<MouseEvent>({ target });

    callShowAtMouseEvent(menu, evt);

    expect(handleLinkContextMenu).toHaveBeenCalledWith(menu, 'note.md', 'current.md');
    target.remove();
  });

  it('should use an empty source path when there is no active file', () => {
    const handleLinkContextMenu = vi.fn();
    const app = strictProxy<App>({
      workspace: {
        getActiveFile: vi.fn().mockReturnValue(null),
        handleLinkContextMenu
      }
    });
    loadPatch(app);

    const menu = createMenu();
    const target = createLinkTarget({ isExternalUrl: false, isWikilink: false, url: 'note.md' });
    const evt = castTo<MouseEvent>({ target });

    callShowAtMouseEvent(menu, evt);

    expect(handleLinkContextMenu).toHaveBeenCalledWith(menu, 'note.md', '');
    target.remove();
  });
});

import {
  App,
  Menu,
  MenuItem,
  MenuSeparator
} from 'obsidian';
import { MonkeyAroundComponent } from 'obsidian-dev-utils/obsidian/components/monkey-around-component';

import { getLinkData } from '../link-data.ts';

export class MenuShowAtMouseEventPatchComponent extends MonkeyAroundComponent {
  public constructor(private readonly app: App) {
    super();
  }

  public override onload(): void {
    this.registerMethodPatch({
      methodName: 'showAtMouseEvent',
      obj: Menu.prototype,
      patchHandler: ({
        fallback,
        originalArgs: [evt],
        originalThis
      }) => {
        const menu = originalThis;
        const target = evt.target as HTMLElement | undefined;

        if (!target) {
          return fallback();
        }

        const linkData = getLinkData(target);
        if (!linkData) {
          return fallback();
        }

        if (menu.items.some((menuItem: MenuItem | MenuSeparator) => (menuItem instanceof MenuItem) && menuItem.section === 'open')) {
          return fallback();
        }
        if (linkData.isExternalUrl) {
          this.app.workspace.handleExternalLinkContextMenu(menu, linkData.url);
        } else {
          this.app.workspace.handleLinkContextMenu(menu, linkData.url, this.app.workspace.getActiveFile()?.path ?? '');
        }

        return fallback();
      }
    });
  }
}

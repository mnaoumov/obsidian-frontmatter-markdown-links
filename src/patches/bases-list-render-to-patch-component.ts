import type { BasesList } from '@obsidian-typings/obsidian-public-latest';

import { getPrototypeOf } from 'obsidian-dev-utils/object-utils';
import { MonkeyAroundComponent } from 'obsidian-dev-utils/obsidian/components/monkey-around-component';

import type { LinkFixer } from '../link-fixer.ts';

interface BasesListRenderToPatchComponentConstructorParams {
  readonly basesList: BasesList;
  readonly linkFixer: LinkFixer;
}

export class BasesListRenderToPatchComponent extends MonkeyAroundComponent {
  private readonly basesList: BasesList;
  private readonly linkFixer: LinkFixer;

  public constructor(params: BasesListRenderToPatchComponentConstructorParams) {
    super();
    this.basesList = params.basesList;
    this.linkFixer = params.linkFixer;
  }

  public override onload(): void {
    this.registerMethodPatch({
      methodName: 'renderTo',
      obj: getPrototypeOf(this.basesList),
      patchHandler: ({
        fallback,
        originalArgs: [containerEl]
      }) => {
        fallback();
        this.linkFixer.fixExternalLinks(containerEl);
      }
    });
  }
}

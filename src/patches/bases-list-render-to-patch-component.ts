import type { BasesList } from '@obsidian-typings/obsidian-public-latest';

import { MonkeyAroundComponent } from '@mnaoumov/obsidian-lib/components/monkey-around-component';
import { getPrototypeOf } from '@mnaoumov/typescript-lib/object-utils';

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
      $object: getPrototypeOf(this.basesList),
      methodName: 'renderTo',
      patchHandler: ({
        fallback,
        originalArguments: [containerEl]
      }) => {
        fallback();
        this.linkFixer.fixExternalLinks(containerEl);
      }
    });
  }
}

import type { BasesExternalLink } from '@obsidian-typings/obsidian-public-latest';

import { getPrototypeOf } from 'obsidian-dev-utils/object-utils';
import { MonkeyAroundComponent } from 'obsidian-dev-utils/obsidian/components/monkey-around-component';

import type { LinkFixer } from '../link-fixer.ts';

interface BasesExternalLinkRenderToPatchComponentConstructorParams {
  readonly basesExternalLink: BasesExternalLink;
  readonly linkFixer: LinkFixer;
}

export class BasesExternalLinkRenderToPatchComponent extends MonkeyAroundComponent {
  private readonly basesExternalLink: BasesExternalLink;
  private readonly linkFixer: LinkFixer;

  public constructor(params: BasesExternalLinkRenderToPatchComponentConstructorParams) {
    super();
    this.basesExternalLink = params.basesExternalLink;
    this.linkFixer = params.linkFixer;
  }

  public override onload(): void {
    this.registerMethodPatch({
      methodName: 'renderTo',
      obj: getPrototypeOf(this.basesExternalLink),
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

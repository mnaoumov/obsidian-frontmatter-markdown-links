import type { BasesExternalLink } from '@obsidian-typings/obsidian-public-latest';

import { MonkeyAroundComponent } from '@mnaoumov/obsidian-lib/components/monkey-around-component';
import { getPrototypeOf } from '@mnaoumov/typescript-lib/object-utils';

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
      $object: getPrototypeOf(this.basesExternalLink),
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

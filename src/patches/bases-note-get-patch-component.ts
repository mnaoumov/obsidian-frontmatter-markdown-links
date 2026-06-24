import type {
  BasesList,
  BasesNote
} from '@obsidian-typings/obsidian-public-latest';

import { getPrototypeOf } from 'obsidian-dev-utils/object-utils';
import { MonkeyAroundComponent } from 'obsidian-dev-utils/obsidian/components/monkey-around-component';

import {
  EXTERNAL_LINK_PREFIX,
  LinkFixer
} from '../link-fixer.ts';
import { BasesExternalLinkRenderToPatchComponent } from './bases-external-link-render-to-patch-component.ts';
import { BasesListRenderToPatchComponent } from './bases-list-render-to-patch-component.ts';

interface BasesNoteGetPatchComponentConstructorParams {
  readonly basesNote: BasesNote;
  readonly linkFixer: LinkFixer;
}

export class BasesNoteGetPatchComponent extends MonkeyAroundComponent {
  private readonly basesNote: BasesNote;
  private isRenderToPatched = false;
  private readonly linkFixer: LinkFixer;

  public constructor(params: BasesNoteGetPatchComponentConstructorParams) {
    super();
    this.basesNote = params.basesNote;
    this.linkFixer = params.linkFixer;
  }

  public override onload(): void {
    this.registerMethodPatch({
      methodName: 'get',
      obj: getPrototypeOf(this.basesNote),
      patchHandler: ({
        fallback,
        originalArgs: [key],
        originalThis
      }) => {
        const value = originalThis.data[key];

        if (!this.isRenderToPatched) {
          this.isRenderToPatched = true;

          originalThis.data[key] = EXTERNAL_LINK_PREFIX;
          const basesExternalLink = fallback();

          this.addChild(
            new BasesExternalLinkRenderToPatchComponent({
              basesExternalLink,
              linkFixer: this.linkFixer
            })
          );

          originalThis.data[key] = [EXTERNAL_LINK_PREFIX];
          const basesList = fallback() as BasesList;

          this.addChild(
            new BasesListRenderToPatchComponent({
              basesList,
              linkFixer: this.linkFixer
            })
          );

          originalThis.data[key] = value;
        }

        try {
          originalThis.data[key] = this.linkFixer.patchLink(value);
          return fallback();
        } finally {
          originalThis.data[key] = value;
        }
      }
    });
  }
}

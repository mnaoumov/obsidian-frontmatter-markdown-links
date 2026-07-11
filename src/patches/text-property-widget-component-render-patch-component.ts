import type { TextPropertyWidgetComponent } from '@obsidian-typings/obsidian-public-latest';

import { getPrototypeOf } from 'obsidian-dev-utils/object-utils';
import { MonkeyAroundComponent } from 'obsidian-dev-utils/obsidian/components/monkey-around-component';
import { parseLink } from 'obsidian-dev-utils/obsidian/parse-link';
import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';

interface TextPropertyWidgetComponentRenderPatchComponentConstructorParams {
  readonly textPropertyWidgetComponent: TextPropertyWidgetComponent;
}

export class TextPropertyWidgetComponentRenderPatchComponent extends MonkeyAroundComponent {
  private readonly textPropertyWidgetComponent: TextPropertyWidgetComponent;

  public constructor(params: TextPropertyWidgetComponentRenderPatchComponentConstructorParams) {
    super();
    this.textPropertyWidgetComponent = params.textPropertyWidgetComponent;
  }

  public override onload(): void {
    this.registerMethodPatch({
      methodName: 'render',
      obj: getPrototypeOf(this.textPropertyWidgetComponent),
      patchHandler: ({
        fallback,
        originalThis
      }) => {
        const parseLinkResult = parseLink(originalThis.value);
        if (parseLinkResult?.isExternal && parseLinkResult.hasAngleBrackets) {
          originalThis.value = ensureNonNullable(parseLinkResult.encodedUrl);
        } else if (parseLinkResult?.isEmbed) {
          originalThis.value = parseLinkResult.raw.slice(1);
        }
        fallback();
      }
    });
  }
}

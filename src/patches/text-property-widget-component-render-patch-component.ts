import type { TextPropertyWidgetComponent } from '@obsidian-typings/obsidian-public-latest';

import { MonkeyAroundComponent } from '@mnaoumov/obsidian-lib/components/monkey-around-component';
import { parseLink } from '@mnaoumov/obsidian-lib/parse-link';
import { getPrototypeOf } from '@mnaoumov/typescript-lib/object-utils';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';

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
      $object: getPrototypeOf(this.textPropertyWidgetComponent),
      methodName: 'render',
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

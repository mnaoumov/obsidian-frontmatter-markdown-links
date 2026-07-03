import type { BasesControl } from '@obsidian-typings/obsidian-public-latest';
import type { App } from 'obsidian';

import { getPrototypeOf } from 'obsidian-dev-utils/object-utils';
import { MonkeyAroundComponent } from 'obsidian-dev-utils/obsidian/components/monkey-around-component';

import { renderStringValueLinks } from '../render-links.ts';

interface StringValueRenderToPatchComponentConstructorParams {
  readonly app: App;
  readonly stringValue: BasesControl;
}

export class StringValueRenderToPatchComponent extends MonkeyAroundComponent {
  private readonly app: App;
  private readonly stringValue: BasesControl;

  public constructor(params: StringValueRenderToPatchComponentConstructorParams) {
    super();
    this.app = params.app;
    this.stringValue = params.stringValue;
  }

  public override onload(): void {
    this.registerMethodPatch({
      methodName: 'renderTo',
      obj: getPrototypeOf(this.stringValue),
      patchHandler: ({
        fallback,
        originalArgs: [containerEl]
      }) => {
        // The native `StringValue.renderTo` sets the raw string as the container's text, so after
        // The fallback the container text is the value. When it holds embedded links,
        // `renderStringValueLinks` empties the container and re-renders text + link spans; otherwise
        // It leaves the native plain-text rendering untouched.
        fallback();
        renderStringValueLinks({
          app: this.app,
          containerEl,
          value: containerEl.textContent
        });
      }
    });
  }
}

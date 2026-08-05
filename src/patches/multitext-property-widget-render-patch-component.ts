import type {
  MultitextPropertyWidgetComponent,
  PropertyWidget
} from '@obsidian-typings/obsidian-public-latest';
import type { App } from 'obsidian';

import { MonkeyAroundComponent } from 'obsidian-dev-utils/obsidian/components/monkey-around-component';

import { MultiTextPropertyComponentRenderValuesPatchComponent } from './multi-text-property-component-render-values-patch-component.ts';

interface MultitextPropertyWidgetRenderPatchComponentConstructorParams {
  readonly app: App;
  readonly multitextPropertyWidget: PropertyWidget<MultitextPropertyWidgetComponent>;
}

export class MultitextPropertyWidgetRenderPatchComponent extends MonkeyAroundComponent {
  private readonly app: App;
  private isPatched = false;
  private readonly multitextPropertyWidget: PropertyWidget<MultitextPropertyWidgetComponent>;

  public constructor(params: MultitextPropertyWidgetRenderPatchComponentConstructorParams) {
    super();
    this.app = params.app;
    this.multitextPropertyWidget = params.multitextPropertyWidget;
  }

  public override onload(): void {
    this.registerMethodPatch({
      $object: this.multitextPropertyWidget,
      methodName: 'render',
      patchHandler: ({
        fallback,
        originalArguments: [containerEl, , context],
        originalMethodBound
      }) => {
        if (!this.isPatched) {
          const temporary = containerEl.createDiv();
          const multiTextPropertyComponent = originalMethodBound(temporary, [], context);

          this.addChild(
            new MultiTextPropertyComponentRenderValuesPatchComponent({
              app: this.app,
              multiselect: multiTextPropertyComponent.multiselect
            })
          );

          this.isPatched = true;
          temporary.remove();
        }

        return fallback();
      }
    });
  }
}

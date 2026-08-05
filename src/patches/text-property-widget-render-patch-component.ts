import type {
  MetadataTypeManagerRegisteredTypeWidgetsRecord,
  PropertyRenderContext,
  PropertyWidget,
  TextPropertyWidgetComponent
} from '@obsidian-typings/obsidian-public-latest';

import { MonkeyAroundComponent } from 'obsidian-dev-utils/obsidian/components/monkey-around-component';
import { parseLinks } from 'obsidian-dev-utils/obsidian/parse-link';

import type { PatchedInputElementMap } from '../patched-input-element-map.ts';

import { getCaretCharacterOffset } from '../selection.ts';
import { TextPropertyWidgetComponentRenderPatchComponent } from './text-property-widget-component-render-patch-component.ts';

interface CreateChildWidgetParams {
  readonly widgetEndOffset: number;
  readonly widgetStartOffset: number;
}

type RenderTextPropertyWidgetComponentFunction = MetadataTypeManagerRegisteredTypeWidgetsRecord['text']['render'];

interface TextPropertyWidgetRenderPatchComponentConstructorParams {
  readonly patchedInputElementMap: PatchedInputElementMap;
  readonly textPropertyWidget: PropertyWidget<TextPropertyWidgetComponent>;
}

interface TextPropertyWidgetRenderPatchComponentRenderWidgetParams {
  readonly containerEl: HTMLElement;
  readonly context: PropertyRenderContext;
  readonly data: unknown;
  readonly originalMethod: RenderTextPropertyWidgetComponentFunction;
}

export class TextPropertyWidgetRenderPatchComponent extends MonkeyAroundComponent {
  private isTextPropertyWidgetComponentPatched = false;
  private readonly patchedInputElementMap: PatchedInputElementMap;
  private readonly textPropertyWidget: PropertyWidget<TextPropertyWidgetComponent>;

  public constructor(params: TextPropertyWidgetRenderPatchComponentConstructorParams) {
    super();
    this.patchedInputElementMap = params.patchedInputElementMap;
    this.textPropertyWidget = params.textPropertyWidget;
  }

  public override onload(): void {
    this.registerMethodPatch({
      $object: this.textPropertyWidget,
      methodName: 'render',
      patchHandler: ({
        originalArguments: [containerEl, data, context],
        originalMethod
      }) => {
        return this.renderWidget({ containerEl, context, data, originalMethod });
      }
    });
  }

  private renderWidget(params: TextPropertyWidgetRenderPatchComponentRenderWidgetParams): TextPropertyWidgetComponent {
    const { containerEl, context, data, originalMethod } = params;

    const contextWithRerenderOnChange = {
      ...context,
      onChange: (newValue: unknown): void => {
        context.onChange(newValue);
        window.requestAnimationFrame(() => {
          containerEl.empty();
          this.renderWidget({ containerEl, context, data: newValue, originalMethod });
        });
      }
    };

    // A property that was JUST created has no value yet, so `data` is null rather than a string. It
    // Still needs the re-render hook: without it, typing a link into that property called Obsidian's
    // Own `onChange` and nothing ever re-rendered, so the link stayed plain text until the property's
    // Type was flipped away and back (which forces a fresh render). That was issue #38.
    if (typeof data !== 'string') {
      return originalMethod(containerEl, data, contextWithRerenderOnChange);
    }

    const $string = data;

    if (!this.isTextPropertyWidgetComponentPatched) {
      const temporary = containerEl.createDiv();
      const textPropertyWidgetComponent = originalMethod(temporary, '', context);

      this.addChild(
        new TextPropertyWidgetComponentRenderPatchComponent({
          textPropertyWidgetComponent
        })
      );

      this.isTextPropertyWidgetComponentPatched = true;
      temporary.remove();
    }

    const parseLinkResults = parseLinks($string);
    containerEl.addClass('frontmatter-markdown-links', 'text-property-widget-component');
    const childWidgetsContainerEl = containerEl.createDiv('metadata-property-value');

    const hasMultipleLinks = parseLinkResults.length > 0 && parseLinkResults[0]?.raw !== $string;

    if (hasMultipleLinks) {
      let startOffset = 0;

      for (const parseLinkResult of parseLinkResults) {
        createChildWidget({ widgetEndOffset: parseLinkResult.startOffset, widgetStartOffset: startOffset });
        createChildWidget({ widgetEndOffset: parseLinkResult.endOffset, widgetStartOffset: parseLinkResult.startOffset });
        startOffset = parseLinkResult.endOffset;
      }

      createChildWidget({ widgetEndOffset: $string.length, widgetStartOffset: startOffset });
    }

    const widget = originalMethod(containerEl, $string, contextWithRerenderOnChange);
    if (hasMultipleLinks) {
      widget.inputEl.hide();
      hideMetadataLink(widget);
      containerEl.append(childWidgetsContainerEl);

      widget.inputEl.addEventListener('blur', () => {
        widget.inputEl.hide();
        hideMetadataLink(widget);
        childWidgetsContainerEl.show();
      });

      this.patchedInputElementMap.setOffset(widget.inputEl, { from: 0, to: 0 });
    }

    return widget;

    function hideMetadataLink(widget2: TextPropertyWidgetComponent): void {
      const metadataLinkEl = widget2.containerEl.find('.metadata-link') as HTMLElement | null;
      metadataLinkEl?.hide();
    }

    function createChildWidget({ widgetEndOffset, widgetStartOffset }: CreateChildWidgetParams): void {
      if (widgetStartOffset >= widgetEndOffset) {
        return;
      }

      const childWidgetValue = $string.slice(widgetStartOffset, widgetEndOffset);
      const childEl = childWidgetsContainerEl.createDiv('metadata-property-value');

      const childWidget = originalMethod(childEl, childWidgetValue, context);
      childWidget.inputEl.addEventListener('focus', () => {
        window.requestAnimationFrame(() => {
          const caretOffset = getCaretCharacterOffset();
          childWidgetsContainerEl.hide();
          widget.inputEl.show();
          widget.inputEl.focus();
          const sel = widget.inputEl.win.getSelection();
          if (!sel) {
            return;
          }
          if (!widget.inputEl.firstChild) {
            return;
          }

          const range = widget.inputEl.doc.createRange();
          range.setStart(widget.inputEl.firstChild, widgetStartOffset + caretOffset);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        });
      });
    }
  }
}

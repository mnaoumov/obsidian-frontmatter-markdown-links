import type {
  MultitextPropertyWidgetComponent,
  PropertyRenderContext,
  PropertyWidget
} from '@obsidian-typings/obsidian-public-latest';
import type { App } from 'obsidian';

import { castTo } from 'obsidian-dev-utils/object-utils';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { MultitextPropertyWidgetRenderPatchComponent } from './multitext-property-widget-render-patch-component.ts';

interface ComponentModuleActual {
  Component: new () => object;
}

// Stub the plugin's own sibling child component so this component's coverage is isolated.
vi.mock('./multi-text-property-component-render-values-patch-component.ts', async () => ({
  MultiTextPropertyComponentRenderValuesPatchComponent: class extends (await vi.importActual<ComponentModuleActual>('obsidian')).Component {}
}));

type RenderFn = (this: PropertyWidget<MultitextPropertyWidgetComponent>, containerEl: HTMLElement, data: unknown, context: PropertyRenderContext) => MultitextPropertyWidgetComponent;

let loadedComponent: MultitextPropertyWidgetRenderPatchComponent | null = null;

afterEach(() => {
  loadedComponent?.unload();
  loadedComponent = null;
  vi.restoreAllMocks();
});

function createContext(): PropertyRenderContext {
  return strictProxy<PropertyRenderContext>({});
}

function createMultiTextPropertyComponent(): MultitextPropertyWidgetComponent {
  return strictProxy<MultitextPropertyWidgetComponent>({
    multiselect: strictProxy<MultitextPropertyWidgetComponent['multiselect']>({})
  });
}

function loadPatch(widget: PropertyWidget<MultitextPropertyWidgetComponent>): void {
  const app = strictProxy<App>({});
  const component = new MultitextPropertyWidgetRenderPatchComponent({
    app,
    multitextPropertyWidget: widget
  });
  component.load();
  loadedComponent = component;
}

describe('MultitextPropertyWidgetRenderPatchComponent', () => {
  it('should patch the widget on the first render and create the render-values child', () => {
    const renderImpl = vi.fn((): MultitextPropertyWidgetComponent => createMultiTextPropertyComponent());
    const widget = castTo<PropertyWidget<MultitextPropertyWidgetComponent>>({ render: renderImpl });
    loadPatch(widget);

    const containerEl = createDiv();
    const result = castTo<RenderFn>(widget.render).call(widget, containerEl, ['item1'], createContext());

    expect(result).toBeDefined();
    // The patch invokes the original render twice on the first call: once for the temp probe div
    // And once for the real container.
    const TOTAL_RENDER_CALLS = 2;
    expect(renderImpl).toHaveBeenCalledTimes(TOTAL_RENDER_CALLS);
    expect(containerEl.childElementCount).toBe(0);
  });

  it('should only fall back to the original render on subsequent renders once patched', () => {
    const renderImpl = vi.fn((): MultitextPropertyWidgetComponent => createMultiTextPropertyComponent());
    const widget = castTo<PropertyWidget<MultitextPropertyWidgetComponent>>({ render: renderImpl });
    loadPatch(widget);

    const containerEl = createDiv();
    castTo<RenderFn>(widget.render).call(widget, containerEl, ['item1'], createContext());
    renderImpl.mockClear();

    const result = castTo<RenderFn>(widget.render).call(widget, containerEl, ['item2'], createContext());

    expect(result).toBeDefined();
    // Once patched, only the single fallback render runs (no temp probe div).
    expect(renderImpl).toHaveBeenCalledTimes(1);
  });
});

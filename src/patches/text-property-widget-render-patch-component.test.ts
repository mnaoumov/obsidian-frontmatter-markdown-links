import type {
  PropertyRenderContext,
  PropertyWidget,
  TextPropertyWidgetComponent
} from '@obsidian-typings/obsidian-public-latest';

import { castTo } from 'obsidian-dev-utils/object-utils';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { PatchedInputElementMap } from '../patched-input-element-map.ts';

interface ObsidianModuleSubset {
  Component: new () => object;
}

// Stub the sibling component so loading the render patch does not install the real prototype patch,
// Isolating coverage to this module. The stub is a no-op `Component` subclass.
vi.mock('./text-property-widget-component-render-patch-component.ts', async () => {
  const { Component } = await vi.importActual<ObsidianModuleSubset>('obsidian');
  return {
    TextPropertyWidgetComponentRenderPatchComponent: class extends Component {}
  };
});

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede this import.
import { TextPropertyWidgetRenderPatchComponent } from './text-property-widget-render-patch-component.ts';

type RenderFunction = PropertyWidget<TextPropertyWidgetComponent>['render'];

interface WidgetObject {
  render: RenderFunction;
}

let loadedComponent: null | TextPropertyWidgetRenderPatchComponent = null;

afterEach(() => {
  loadedComponent?.unload();
  loadedComponent = null;
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.spyOn(activeWindow, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
});

function createContext(): PropertyRenderContext {
  return castTo<PropertyRenderContext>({
    onChange: vi.fn(),
    sourcePath: 'test.md'
  });
}

function createSelection(overrides: Partial<Selection>): Selection {
  return castTo<Selection>({
    getRangeAt: () => castTo<Range>({ startOffset: 0 }),
    rangeCount: 1,
    ...overrides
  });
}

function createWidgetComponent(value: string): TextPropertyWidgetComponent {
  const inputEl = castTo<TextPropertyWidgetComponent['inputEl']>(createDiv());
  inputEl.hide = vi.fn();
  inputEl.show = vi.fn();
  const containerEl = createDiv();
  // Add a `metadata-link` element so `containerEl.find('.metadata-link')` resolves a real element.
  const metadataLinkEl = createSpan();
  metadataLinkEl.addClass('metadata-link');
  metadataLinkEl.hide = vi.fn();
  containerEl.append(metadataLinkEl);
  return castTo<TextPropertyWidgetComponent>({
    containerEl,
    inputEl,
    value
  });
}

function createWidgetObject(): WidgetObject {
  // The real `originalMethod` returns a widget with `.inputEl`/`.containerEl`; this stub mirrors that
  // Shape and appends each input element to the container so the focus DOM lookups work.
  return {
    render: vi.fn().mockImplementation((el: HTMLElement, value: unknown, _context: PropertyRenderContext): TextPropertyWidgetComponent => {
      const component = createWidgetComponent(typeof value === 'string' ? value : '');
      component.inputEl.addClass('mock-widget-input');
      el.append(component.inputEl);
      return component;
    })
  };
}

function loadPatch(widgetObject: WidgetObject, patchedInputElementMap: PatchedInputElementMap): void {
  const component = new TextPropertyWidgetRenderPatchComponent({
    patchedInputElementMap,
    textPropertyWidget: castTo<PropertyWidget<TextPropertyWidgetComponent>>(widgetObject)
  });
  component.load();
  loadedComponent = component;
}

function stubInputElEnvironment(inputEl: HTMLElement, selection: null | Selection): void {
  // The test-mocks `.win`/`.doc` accessors are not real Window/Document objects, so stub the
  // Specific members the source uses for caret/range manipulation.
  Object.defineProperties(inputEl, {
    doc: {
      configurable: true,
      value: castTo<Document>({
        createRange: () =>
          castTo<Range>({
            collapse: vi.fn(),
            setStart: vi.fn()
          })
      })
    },
    win: {
      configurable: true,
      value: castTo<Window>({
        getSelection: vi.fn().mockReturnValue(selection)
      })
    }
  });
}

describe('TextPropertyWidgetRenderPatchComponent', () => {
  it('should delegate to the original method for non-string data', () => {
    const widgetObject = createWidgetObject();
    const originalRender = widgetObject.render;
    loadPatch(widgetObject, new PatchedInputElementMap());

    const el = createDiv();
    const context = createContext();
    const result = widgetObject.render(el, 42, context);

    expect(result).toBeDefined();
    expect(originalRender).toHaveBeenCalledWith(el, 42, context);
  });

  it('should render a plain string with the frontmatter-markdown-links classes', () => {
    const widgetObject = createWidgetObject();
    loadPatch(widgetObject, new PatchedInputElementMap());

    const el = createDiv();
    const result = widgetObject.render(el, 'plain text', createContext());

    expect(result).toBeDefined();
    expect(el.hasClass('frontmatter-markdown-links')).toBe(true);
    expect(el.hasClass('text-property-widget-component')).toBe(true);
  });

  it('should patch the widget component only on the first string render', () => {
    const widgetObject = createWidgetObject();
    const childSpy = vi.spyOn(TextPropertyWidgetRenderPatchComponent.prototype, 'addChild');
    loadPatch(widgetObject, new PatchedInputElementMap());

    const el1 = createDiv();
    widgetObject.render(el1, 'first', createContext());
    const el2 = createDiv();
    widgetObject.render(el2, 'second', createContext());

    expect(childSpy).toHaveBeenCalledTimes(1);
  });

  it('should re-render on change via requestAnimationFrame', () => {
    const widgetObject = createWidgetObject();
    const originalRender = vi.mocked(widgetObject.render);
    const onChange = vi.fn();
    const context = castTo<PropertyRenderContext>({ onChange, sourcePath: 'test.md' });
    loadPatch(widgetObject, new PatchedInputElementMap());

    const el = createDiv();
    widgetObject.render(el, 'plain', context);

    // The patched context is the last argument the original render received for the main widget.
    const capturedContext = originalRender.mock.calls.at(-1)?.[2];
    capturedContext?.onChange('new value');

    expect(onChange).toHaveBeenCalledWith('new value');
  });

  it('should hide the input and wire the blur handler for multi-link values', () => {
    const widgetObject = createWidgetObject();
    const patchedInputElementMap = new PatchedInputElementMap();
    loadPatch(widgetObject, patchedInputElementMap);

    const el = createDiv();
    const widget = widgetObject.render(el, 'text [a](x.md) and [b](y.md)', createContext());

    expect(widget.inputEl.hide).toHaveBeenCalledTimes(1);
    expect(patchedInputElementMap.has(castTo<HTMLDivElement>(widget.inputEl))).toBe(true);

    // Trigger the blur handler to cover its body.
    widget.inputEl.dispatchEvent(new FocusEvent('blur'));
    expect(widget.inputEl.hide).toHaveBeenCalledTimes(2);
  });

  it('should focus the main input and set the selection range when a child widget is focused', () => {
    const widgetObject = createWidgetObject();
    loadPatch(widgetObject, new PatchedInputElementMap());
    vi.spyOn(activeWindow, 'getSelection').mockReturnValue(createSelection({}));

    const el = createDiv();
    const widget = widgetObject.render(el, 'text [a](x.md) and [b](y.md)', createContext());
    widget.inputEl.append(activeDocument.createTextNode('text [a](x.md) and [b](y.md)'));
    const focusSpy = vi.spyOn(widget.inputEl, 'focus');
    const addRange = vi.fn();
    const removeAllRanges = vi.fn();
    stubInputElEnvironment(widget.inputEl, createSelection({ addRange, removeAllRanges }));

    const childInputEl = el.querySelector(':scope .metadata-property-value .metadata-property-value .mock-widget-input');
    childInputEl?.dispatchEvent(new FocusEvent('focus'));

    expect(focusSpy).toHaveBeenCalled();
    expect(removeAllRanges).toHaveBeenCalled();
    expect(addRange).toHaveBeenCalled();
  });

  it('should return early in the focus handler when there is no selection', () => {
    const widgetObject = createWidgetObject();
    loadPatch(widgetObject, new PatchedInputElementMap());
    vi.spyOn(activeWindow, 'getSelection').mockReturnValue(createSelection({}));

    const el = createDiv();
    const widget = widgetObject.render(el, 'text [a](x.md) and [b](y.md)', createContext());
    widget.inputEl.append(activeDocument.createTextNode('seed'));
    const focusSpy = vi.spyOn(widget.inputEl, 'focus');
    // The main input's window reports no active selection, so the range setup is skipped.
    stubInputElEnvironment(widget.inputEl, null);

    const childInputEl = el.querySelector(':scope .metadata-property-value .metadata-property-value .mock-widget-input');
    childInputEl?.dispatchEvent(new FocusEvent('focus'));

    expect(focusSpy).toHaveBeenCalled();
  });

  it('should return early in the focus handler when the main input has no firstChild', () => {
    const widgetObject = createWidgetObject();
    loadPatch(widgetObject, new PatchedInputElementMap());
    vi.spyOn(activeWindow, 'getSelection').mockReturnValue(createSelection({}));

    const el = createDiv();
    const widget = widgetObject.render(el, 'text [a](x.md) and [b](y.md)', createContext());
    const focusSpy = vi.spyOn(widget.inputEl, 'focus');
    const addRange = vi.fn();
    // The main input has no firstChild text node, so the range setup is skipped.
    stubInputElEnvironment(widget.inputEl, createSelection({ addRange, removeAllRanges: vi.fn() }));

    const childInputEl = el.querySelector(':scope .metadata-property-value .metadata-property-value .mock-widget-input');
    childInputEl?.dispatchEvent(new FocusEvent('focus'));

    expect(focusSpy).toHaveBeenCalled();
    expect(addRange).not.toHaveBeenCalled();
  });
});

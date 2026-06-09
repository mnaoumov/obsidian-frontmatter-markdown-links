import type {
  MetadataTypeManager,
  PropertyRenderContext,
  TextPropertyWidgetComponent
} from '@obsidian-typings/obsidian-public-latest';
import type {
  AbstractInputSuggest,
  App
} from 'obsidian';

import {
  castTo,
  getPrototypeOf
} from 'obsidian-dev-utils/object-utils';
import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { Plugin } from './plugin.ts';

type AnyFn = (...args: never[]) => unknown;
type RenderFn = (el: HTMLElement, data: unknown, ctx: PropertyRenderContext) => unknown;

interface WidgetWithRender {
  render: RenderFn;
}

vi.mock('obsidian-dev-utils/obsidian/components/monkey-around-component', () => {
  class MonkeyAroundComponent {
    public registerPatch(obj: Record<string, AnyFn>, factories: Record<string, (next: AnyFn) => AnyFn>): void {
      for (const [key, factory] of Object.entries(factories)) {
        const original = obj[key];
        if (typeof original === 'function') {
          obj[key] = factory(original);
        }
      }
    }
  }
  return { MonkeyAroundComponent };
});

vi.mock('obsidian-dev-utils/object-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('obsidian-dev-utils/object-utils')>();
  return {
    ...actual,
    getPrototypeOf: vi.fn().mockReturnValue({})
  };
});

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { patchTextPropertyWidgetComponent } from './text-property-widget-component.ts';

function createMockPlugin(): Plugin {
  const addChildFn = vi.fn().mockImplementation(<T>(child: T) => child);
  const mockWidget = {
    render: vi.fn().mockImplementation((el: HTMLElement, value: unknown, _ctx: PropertyRenderContext): TextPropertyWidgetComponent => {
      const component = createMockTextPropertyWidgetComponent();
      component.value = typeof value === 'string' ? value : '';
      // Mark each returned widget's input element so tests can locate child widgets in the DOM.
      component.inputEl.addClass('mock-widget-input');
      el.appendChild(component.inputEl);
      return component;
    })
  };
  const mockMetadataTypeManager = castTo<MetadataTypeManager>({
    registeredTypeWidgets: {
      text: mockWidget
    }
  });
  const app = castTo<App>({
    metadataTypeManager: mockMetadataTypeManager
  });

  return castTo<Plugin>({
    addChild: addChildFn,
    app
  });
}

function createMockPropertyRenderContext(): PropertyRenderContext {
  return castTo<PropertyRenderContext>({
    onChange: vi.fn(),
    sourcePath: 'test.md'
  });
}

function createMockTextPropertyWidgetComponent(): TextPropertyWidgetComponent {
  const inputEl = castTo<TextPropertyWidgetComponent['inputEl']>(activeDocument.createElement('div'));
  inputEl.textContent = '';
  inputEl.hide = vi.fn();
  inputEl.show = vi.fn();
  const containerEl = activeDocument.createElement('div');
  // Add metadata-link element so containerEl.find('.metadata-link') doesn't throw.
  const metadataLinkEl = activeDocument.createElement('span');
  metadataLinkEl.addClass('metadata-link');
  metadataLinkEl.hide = vi.fn();
  containerEl.appendChild(metadataLinkEl);
  return castTo<TextPropertyWidgetComponent>({
    containerEl,
    inputEl,
    value: ''
  });
}

describe('patchTextPropertyWidgetComponent', () => {
  it('should create MonkeyAroundComponent children on the plugin', async () => {
    // eslint-disable-next-line no-restricted-syntax -- Dynamic import required to read the mocked module instance.
    const { MonkeyAroundComponent } = await import('obsidian-dev-utils/obsidian/components/monkey-around-component');
    const plugin = createMockPlugin();

    patchTextPropertyWidgetComponent(plugin);

    expect(plugin.addChild).toHaveBeenCalledWith(expect.any(MonkeyAroundComponent));
  });

  it('should register a patch on the text widget', async () => {
    // eslint-disable-next-line no-restricted-syntax -- Dynamic import required to read the mocked module instance.
    const { MonkeyAroundComponent } = await import('obsidian-dev-utils/obsidian/components/monkey-around-component');
    const spy = vi.spyOn(MonkeyAroundComponent.prototype, 'registerPatch');
    const plugin = createMockPlugin();

    patchTextPropertyWidgetComponent(plugin);

    const textWidget: WidgetWithRender = plugin.app.metadataTypeManager.registeredTypeWidgets.text;
    expect(spy).toHaveBeenCalledWith(
      textWidget,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest asymmetric matchers (objectContaining/any) are typed as any.
      expect.objectContaining({ render: expect.any(Function) })
    );
  });
});

describe('renderWidget', () => {
  it('should call through to original render for non-string data', () => {
    const plugin = createMockPlugin();
    const textWidget = plugin.app.metadataTypeManager.registeredTypeWidgets.text as WidgetWithRender;
    const el = activeDocument.createElement('div');
    const ctx = createMockPropertyRenderContext();

    patchTextPropertyWidgetComponent(plugin);

    // Non-string data should delegate directly.
    const result = textWidget.render(el, 42, ctx);

    expect(result).toBeDefined();
  });

  it('should render string data with frontmatter-markdown-links class', () => {
    const plugin = createMockPlugin();
    const textWidget = plugin.app.metadataTypeManager.registeredTypeWidgets.text as WidgetWithRender;
    const el = activeDocument.createElement('div');
    const ctx = createMockPropertyRenderContext();

    patchTextPropertyWidgetComponent(plugin);

    const result = textWidget.render(el, 'plain text', ctx);

    expect(result).toBeDefined();
    expect(el.classList.contains('frontmatter-markdown-links')).toBe(true);
  });

  it('should render string with internal markdown link with child widget containers', () => {
    const plugin = createMockPlugin();
    const textWidget = plugin.app.metadataTypeManager.registeredTypeWidgets.text as WidgetWithRender;
    const el = activeDocument.createElement('div');
    const ctx = createMockPropertyRenderContext();

    patchTextPropertyWidgetComponent(plugin);

    const result = textWidget.render(el, '[note](target.md)', ctx);

    expect(result).toBeDefined();
    expect(el.classList.contains('frontmatter-markdown-links')).toBe(true);
  });

  it('should create multiple child widgets for a value with multiple links', () => {
    const plugin = createMockPlugin();
    const textWidget = plugin.app.metadataTypeManager.registeredTypeWidgets.text as WidgetWithRender;
    const el = activeDocument.createElement('div');
    const ctx = createMockPropertyRenderContext();

    patchTextPropertyWidgetComponent(plugin);

    const result = textWidget.render(el, 'text [note1](a.md) and [note2](b.md)', ctx);

    expect(result).toBeDefined();
    expect(el.classList.contains('frontmatter-markdown-links')).toBe(true);
  });
});

interface CaptureResult {
  plugin: Plugin;
  renderProto: RenderProto;
  textWidget: WidgetWithRender;
}

interface RenderProto {
  render: AnyFn;
}

async function freshPatch(renderProto: RenderProto): Promise<CaptureResult> {
  vi.resetModules();
  // eslint-disable-next-line no-restricted-syntax -- Dynamic import required to re-read the mocked module after vi.resetModules().
  const objectUtils = await import('obsidian-dev-utils/object-utils');
  vi.mocked(objectUtils.getPrototypeOf).mockImplementation(() => renderProto);
  // eslint-disable-next-line no-restricted-syntax -- Dynamic import required to re-read the module after vi.resetModules().
  const { patchTextPropertyWidgetComponent: patchFn } = await import('./text-property-widget-component.ts');
  const plugin = createMockPlugin();
  const textWidget = plugin.app.metadataTypeManager.registeredTypeWidgets.text as WidgetWithRender;
  patchFn(plugin);
  return {
    plugin,
    renderProto,
    textWidget
  };
}

describe('render patch (renderPatched)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(getPrototypeOf).mockReturnValue({});
  });

  it('should wrap the component render method on first render', async () => {
    const renderProto: RenderProto = { render: vi.fn() };
    const original = renderProto.render;
    const { textWidget } = await freshPatch(renderProto);
    textWidget.render(activeDocument.createElement('div'), 'plain text', createMockPropertyRenderContext());

    expect(renderProto.render).not.toBe(original);
  });

  it('should normalize an angle-bracket external link value when rendering', async () => {
    const renderProto: RenderProto = { render: vi.fn() };
    const { textWidget } = await freshPatch(renderProto);
    textWidget.render(activeDocument.createElement('div'), 'plain text', createMockPropertyRenderContext());

    const component = createMockTextPropertyWidgetComponent();
    component.value = '<https://example.com>';
    renderProto.render.call(component);

    expect(component.value).toBe('https://example.com');
  });

  it('should strip the leading exclamation mark from an embed value when rendering', async () => {
    const renderProto: RenderProto = { render: vi.fn() };
    const { textWidget } = await freshPatch(renderProto);
    textWidget.render(activeDocument.createElement('div'), 'plain text', createMockPropertyRenderContext());

    const component = createMockTextPropertyWidgetComponent();
    component.value = '![[note]]';
    renderProto.render.call(component);

    expect(component.value).toBe('[[note]]');
  });

  it('should leave a plain value unchanged when rendering', async () => {
    const renderProto: RenderProto = { render: vi.fn() };
    const { textWidget } = await freshPatch(renderProto);
    textWidget.render(activeDocument.createElement('div'), 'plain text', createMockPropertyRenderContext());

    const component = createMockTextPropertyWidgetComponent();
    component.value = 'plain';
    renderProto.render.call(component);

    expect(component.value).toBe('plain');
  });
});

describe('onChange rerender', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(getPrototypeOf).mockReturnValue({});
  });

  it('should re-render on change via requestAnimationFrame', async () => {
    const rafSpy = vi.spyOn(activeWindow, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    const renderProto: RenderProto = { render: vi.fn() };
    vi.resetModules();
    // eslint-disable-next-line no-restricted-syntax -- Dynamic import required to re-read the mocked module after vi.resetModules().
    const objectUtils = await import('obsidian-dev-utils/object-utils');
    vi.mocked(objectUtils.getPrototypeOf).mockImplementation(() => renderProto);
    // eslint-disable-next-line no-restricted-syntax -- Dynamic import required to re-read the module after vi.resetModules().
    const { patchTextPropertyWidgetComponent: patchFn } = await import('./text-property-widget-component.ts');
    const plugin = createMockPlugin();
    const textWidget = plugin.app.metadataTypeManager.registeredTypeWidgets.text as WidgetWithRender;
    // Capture the original (unpatched) render mock to inspect the rewritten ctx.
    const originalRenderMock = vi.mocked(textWidget.render);
    patchFn(plugin);

    const onChange = vi.fn();
    const ctx = castTo<PropertyRenderContext>({ onChange, sourcePath: 'test.md' });

    const el = activeDocument.createElement('div');
    textWidget.render(el, 'plain', ctx);

    const capturedCtx = ensureNonNullable(originalRenderMock.mock.calls.at(-1))[2];
    capturedCtx.onChange('new value');

    expect(onChange).toHaveBeenCalledWith('new value');
    rafSpy.mockRestore();
  });
});

function createSelectionMock(overrides: Partial<Selection>): Selection {
  return castTo<Selection>({
    getRangeAt: () => castTo<Range>({ startOffset: 0 }),
    rangeCount: 1,
    ...overrides
  });
}

function stubInputElEnvironment(inputEl: HTMLElement, selection: null | Selection): void {
  // The obsidian-test-mocks `.win`/`.doc` accessors are not real Window/Document objects,
  // So stub them on the specific element with the members the source code uses.
  Object.defineProperty(inputEl, 'win', {
    configurable: true,
    value: castTo<Window>({
      getSelection: vi.fn().mockReturnValue(selection)
    })
  });
  Object.defineProperty(inputEl, 'doc', {
    configurable: true,
    value: castTo<Document>({
      createRange: () =>
        castTo<Range>({
          collapse: vi.fn(),
          setStart: vi.fn()
        })
    })
  });
}

describe('multi-link child widgets and focus handler', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(getPrototypeOf).mockReturnValue({});
  });

  it('should hide the input and wire up blur handler for multi-link values', async () => {
    const renderProto: RenderProto = { render: vi.fn() };
    const { textWidget } = await freshPatch(renderProto);

    const el = activeDocument.createElement('div');
    const widget = textWidget.render(el, 'text [a](x.md) and [b](y.md)', createMockPropertyRenderContext()) as TextPropertyWidgetComponent;

    expect(widget.inputEl.hide).toHaveBeenCalled();

    // Trigger the blur handler.
    widget.inputEl.dispatchEvent(new FocusEvent('blur'));
    expect(widget.inputEl.hide).toHaveBeenCalledTimes(2);
  });

  it('should focus the main input and set selection range when a child widget is focused', async () => {
    const renderProto: RenderProto = { render: vi.fn() };
    const { textWidget } = await freshPatch(renderProto);

    const rafSpy = vi.spyOn(activeWindow, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    const getSelectionSpy = vi.spyOn(activeWindow, 'getSelection').mockReturnValue(createSelectionMock({}));

    const el = activeDocument.createElement('div');
    const widget = textWidget.render(el, 'text [a](x.md) and [b](y.md)', createMockPropertyRenderContext()) as TextPropertyWidgetComponent;
    widget.inputEl.appendChild(activeDocument.createTextNode('text [a](x.md) and [b](y.md)'));
    const focusSpy = vi.spyOn(widget.inputEl, 'focus');
    const addRange = vi.fn();
    const removeAllRanges = vi.fn();
    stubInputElEnvironment(widget.inputEl, createSelectionMock({ addRange, removeAllRanges }));

    const childInputEl = el.querySelector('.metadata-property-value .metadata-property-value .mock-widget-input');
    childInputEl?.dispatchEvent(new FocusEvent('focus'));

    expect(focusSpy).toHaveBeenCalled();
    expect(removeAllRanges).toHaveBeenCalled();
    expect(addRange).toHaveBeenCalled();
    rafSpy.mockRestore();
    getSelectionSpy.mockRestore();
  });

  it('should return early in focus handler when there is no selection', async () => {
    const renderProto: RenderProto = { render: vi.fn() };
    const { textWidget } = await freshPatch(renderProto);

    const rafSpy = vi.spyOn(activeWindow, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    const getSelectionSpy = vi.spyOn(activeWindow, 'getSelection').mockReturnValue(createSelectionMock({}));

    const el = activeDocument.createElement('div');
    const widget = textWidget.render(el, 'text [a](x.md) and [b](y.md)', createMockPropertyRenderContext()) as TextPropertyWidgetComponent;
    widget.inputEl.appendChild(activeDocument.createTextNode('seed'));
    const focusSpy = vi.spyOn(widget.inputEl, 'focus');
    // The main input's window reports no active selection, so the range setup is skipped.
    stubInputElEnvironment(widget.inputEl, null);

    const childInputEl = el.querySelector('.metadata-property-value .metadata-property-value .mock-widget-input');
    childInputEl?.dispatchEvent(new FocusEvent('focus'));

    expect(focusSpy).toHaveBeenCalled();
    rafSpy.mockRestore();
    getSelectionSpy.mockRestore();
  });

  it('should return early in focus handler when the main input has no firstChild', async () => {
    const renderProto: RenderProto = { render: vi.fn() };
    const { textWidget } = await freshPatch(renderProto);

    const rafSpy = vi.spyOn(activeWindow, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    const getSelectionSpy = vi.spyOn(activeWindow, 'getSelection').mockReturnValue(createSelectionMock({}));

    const el = activeDocument.createElement('div');
    const widget = textWidget.render(el, 'text [a](x.md) and [b](y.md)', createMockPropertyRenderContext()) as TextPropertyWidgetComponent;
    const focusSpy = vi.spyOn(widget.inputEl, 'focus');
    // Widget.inputEl has no firstChild text node, so the range setup is skipped.
    const addRange = vi.fn();
    stubInputElEnvironment(widget.inputEl, createSelectionMock({ addRange, removeAllRanges: vi.fn() }));

    const childInputEl = el.querySelector('.metadata-property-value .metadata-property-value .mock-widget-input');
    childInputEl?.dispatchEvent(new FocusEvent('focus'));

    expect(focusSpy).toHaveBeenCalled();
    expect(addRange).not.toHaveBeenCalled();
    rafSpy.mockRestore();
    getSelectionSpy.mockRestore();
  });
});

type AbstractInputSuggestCtor = new (app: App, textInputEl: HTMLDivElement) => AbstractInputSuggest<MySearchResult>;

interface FreshSuggestModule {
  AbstractInputSuggestCls: AbstractInputSuggestCtor;
  suggestProto: SuggestProto;
  textWidget: WidgetWithRender;
}

interface MySearchResult {
  text: string;
  type: string;
}

type SelectSuggestionFn = (this: unknown, value: MySearchResult, evt: KeyboardEvent | MouseEvent) => void;

interface SuggestProto {
  selectSuggestion: SelectSuggestionFn;
}

interface TextInputElHolder {
  textInputEl: HTMLDivElement;
}

async function freshSuggestModule(suggestProto: SuggestProto): Promise<FreshSuggestModule> {
  vi.resetModules();
  // eslint-disable-next-line no-restricted-syntax -- Dynamic import required to re-read the mocked module after vi.resetModules().
  const objectUtils = await import('obsidian-dev-utils/object-utils');
  vi.mocked(objectUtils.getPrototypeOf).mockReturnValue(suggestProto);
  // eslint-disable-next-line no-restricted-syntax -- Dynamic import required to re-read the module after vi.resetModules().
  const obsidian = await import('obsidian');
  // eslint-disable-next-line no-restricted-syntax -- Dynamic import required to re-read the module after vi.resetModules().
  const { patchTextPropertyWidgetComponent: patchFn } = await import('./text-property-widget-component.ts');
  const plugin = createMockPlugin();
  const textWidget = plugin.app.metadataTypeManager.registeredTypeWidgets.text as WidgetWithRender;
  patchFn(plugin);
  return {
    AbstractInputSuggestCls: castTo<AbstractInputSuggestCtor>(obsidian.AbstractInputSuggest),
    suggestProto,
    textWidget
  };
}

function makeSuggest(
  AbstractInputSuggestCls: AbstractInputSuggestCtor,
  textInputEl: HTMLDivElement
): AbstractInputSuggest<MySearchResult> {
  const suggest = new AbstractInputSuggestCls(castTo<App>({}), textInputEl);
  castTo<TextInputElHolder>(suggest).textInputEl = textInputEl;
  return suggest;
}

describe('getValue patch', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(getPrototypeOf).mockReturnValue({});
  });

  it('should return the original value when the input element is not patched', async () => {
    const suggestProto: SuggestProto = { selectSuggestion: vi.fn() };
    const { AbstractInputSuggestCls } = await freshSuggestModule(suggestProto);

    const textInputEl = activeDocument.createElement('div');
    textInputEl.textContent = 'Unpatched value';
    const suggest = makeSuggest(AbstractInputSuggestCls, textInputEl);

    const result = suggest.getValue();

    expect(result).toBe('Unpatched value');
  });

  it('should register a selectSuggestion patch on the suggest prototype on first getValue call', async () => {
    const suggestProto: SuggestProto = { selectSuggestion: vi.fn() };
    const original = suggestProto.selectSuggestion;
    const { AbstractInputSuggestCls } = await freshSuggestModule(suggestProto);

    const textInputEl = activeDocument.createElement('div');
    textInputEl.textContent = 'Value';
    const suggest = makeSuggest(AbstractInputSuggestCls, textInputEl);
    suggest.getValue();

    expect(suggestProto.selectSuggestion).not.toBe(original);
  });

  it('should slice the value to the open-bracket region when the input is patched', async () => {
    const suggestProto: SuggestProto = { selectSuggestion: vi.fn() };
    const { AbstractInputSuggestCls, textWidget } = await freshSuggestModule(suggestProto);

    // Render a multi-link widget to register its input in the patched-input map.
    const el = activeDocument.createElement('div');
    const widget = textWidget.render(el, 'text [a](x.md) and [b](y.md)', createMockPropertyRenderContext()) as TextPropertyWidgetComponent;

    widget.inputEl.textContent = 'Foo [[bar';
    const suggest = makeSuggest(AbstractInputSuggestCls, castTo<HTMLDivElement>(widget.inputEl));

    const caretSpy = vi.spyOn(activeWindow, 'getSelection').mockReturnValue(castTo<Selection>({
      getRangeAt: () => castTo<Range>({ startOffset: 9 }),
      rangeCount: 1
    }));

    const result = suggest.getValue();

    expect(result).toBe('[[bar');
    caretSpy.mockRestore();
  });

  it('should return the full value when there is no open bracket before the caret', async () => {
    const suggestProto: SuggestProto = { selectSuggestion: vi.fn() };
    const { AbstractInputSuggestCls, textWidget } = await freshSuggestModule(suggestProto);

    const el = activeDocument.createElement('div');
    const widget = textWidget.render(el, 'text [a](x.md) and [b](y.md)', createMockPropertyRenderContext()) as TextPropertyWidgetComponent;

    widget.inputEl.textContent = 'Plain value';
    const suggest = makeSuggest(AbstractInputSuggestCls, castTo<HTMLDivElement>(widget.inputEl));

    const caretSpy = vi.spyOn(activeWindow, 'getSelection').mockReturnValue(castTo<Selection>({
      getRangeAt: () => castTo<Range>({ startOffset: 5 }),
      rangeCount: 1
    }));

    const result = suggest.getValue();

    expect(result).toBe('Plain value');
    caretSpy.mockRestore();
  });

  it('should return the full value when a close bracket follows the open bracket before the caret', async () => {
    const suggestProto: SuggestProto = { selectSuggestion: vi.fn() };
    const { AbstractInputSuggestCls, textWidget } = await freshSuggestModule(suggestProto);

    const el = activeDocument.createElement('div');
    const widget = textWidget.render(el, 'text [a](x.md) and [b](y.md)', createMockPropertyRenderContext()) as TextPropertyWidgetComponent;

    widget.inputEl.textContent = '[[done]] more';
    const suggest = makeSuggest(AbstractInputSuggestCls, castTo<HTMLDivElement>(widget.inputEl));

    const caretSpy = vi.spyOn(activeWindow, 'getSelection').mockReturnValue(castTo<Selection>({
      getRangeAt: () => castTo<Range>({ startOffset: 13 }),
      rangeCount: 1
    }));

    const result = suggest.getValue();

    expect(result).toBe('[[done]] more');
    caretSpy.mockRestore();
  });
});

describe('getCaretCharacterOffset', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(getPrototypeOf).mockReturnValue({});
  });

  it('should return 0 when there is no selection', async () => {
    const suggestProto: SuggestProto = { selectSuggestion: vi.fn() };
    const { AbstractInputSuggestCls, textWidget } = await freshSuggestModule(suggestProto);

    const el = activeDocument.createElement('div');
    const widget = textWidget.render(el, 'text [a](x.md) and [b](y.md)', createMockPropertyRenderContext()) as TextPropertyWidgetComponent;
    widget.inputEl.textContent = '[[bar';
    const suggest = makeSuggest(AbstractInputSuggestCls, castTo<HTMLDivElement>(widget.inputEl));

    const caretSpy = vi.spyOn(activeWindow, 'getSelection').mockReturnValue(null);

    const result = suggest.getValue();

    // CaretOffset is 0 -> valueBeforeCaret is empty -> no open bracket -> full value returned.
    expect(result).toBe('[[bar');
    caretSpy.mockRestore();
  });

  it('should return 0 when the selection has no ranges', async () => {
    const suggestProto: SuggestProto = { selectSuggestion: vi.fn() };
    const { AbstractInputSuggestCls, textWidget } = await freshSuggestModule(suggestProto);

    const el = activeDocument.createElement('div');
    const widget = textWidget.render(el, 'text [a](x.md) and [b](y.md)', createMockPropertyRenderContext()) as TextPropertyWidgetComponent;
    widget.inputEl.textContent = '[[bar';
    const suggest = makeSuggest(AbstractInputSuggestCls, castTo<HTMLDivElement>(widget.inputEl));

    const caretSpy = vi.spyOn(activeWindow, 'getSelection').mockReturnValue(castTo<Selection>({
      getRangeAt: () => castTo<Range>({ startOffset: 0 }),
      rangeCount: 0
    }));

    const result = suggest.getValue();

    expect(result).toBe('[[bar');
    caretSpy.mockRestore();
  });
});

describe('selectSuggestion patch', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(getPrototypeOf).mockReturnValue({});
  });

  it('should delegate directly to next when the input is not patched', async () => {
    const selectSuggestionImpl = vi.fn();
    const suggestProto: SuggestProto = { selectSuggestion: selectSuggestionImpl };
    const { AbstractInputSuggestCls } = await freshSuggestModule(suggestProto);

    const textInputEl = activeDocument.createElement('div');
    textInputEl.textContent = 'Value';
    const suggest = makeSuggest(AbstractInputSuggestCls, textInputEl);
    // Trigger getValue so the selectSuggestion patch is installed.
    suggest.getValue();

    const value: MySearchResult = { text: 'chosen', type: 'text' };
    const evt = new MouseEvent('click');
    suggestProto.selectSuggestion.call(suggest, value, evt);

    expect(selectSuggestionImpl).toHaveBeenCalledTimes(1);
    expect(selectSuggestionImpl).toHaveBeenCalledWith(value, evt);
  });

  it('should splice the chosen value into the original text when the input is patched', async () => {
    const setValueCalls: string[] = [];
    const selectSuggestionImpl = vi.fn().mockImplementation(function selectSuggestionMock(this: TextInputElHolder, value: MySearchResult): void {
      this.textInputEl.textContent = value.text;
      setValueCalls.push(value.text);
    });
    const suggestProto: SuggestProto = { selectSuggestion: selectSuggestionImpl };
    const { AbstractInputSuggestCls, textWidget } = await freshSuggestModule(suggestProto);

    const el = activeDocument.createElement('div');
    const widget = textWidget.render(el, 'text [a](x.md) and [b](y.md)', createMockPropertyRenderContext()) as TextPropertyWidgetComponent;

    widget.inputEl.textContent = 'Foo [[bar';
    const suggest = makeSuggest(AbstractInputSuggestCls, castTo<HTMLDivElement>(widget.inputEl));

    const caretSpy = vi.spyOn(activeWindow, 'getSelection').mockReturnValue(castTo<Selection>({
      getRangeAt: () => castTo<Range>({ startOffset: 9 }),
      rangeCount: 1
    }));
    // Populate the from/to offsets via getValue (open bracket at 4, caret at 9).
    suggest.getValue();
    caretSpy.mockRestore();

    const value: MySearchResult = { text: '[[bar|Bar]]', type: 'text' };
    const evt = new MouseEvent('click');
    suggestProto.selectSuggestion.call(suggest, value, evt);

    // Final call should splice: oldValue.slice(0,4) + newValue + oldValue.slice(9).
    const lastCall = vi.mocked(selectSuggestionImpl).mock.calls.at(-1)?.[0] as MySearchResult;
    expect(lastCall.text).toBe('Foo [[bar|Bar]]');
    expect(lastCall.type).toBe('text');
  });
});

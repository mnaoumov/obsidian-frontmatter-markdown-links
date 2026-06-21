import type {
  MetadataTypeManager,
  PropertyRenderContext
} from '@obsidian-typings/obsidian-public-latest';
import type { App } from 'obsidian';

import {
  castTo,
  getPrototypeOf
} from 'obsidian-dev-utils/object-utils';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { Plugin } from './plugin.ts';

type AnyFn = (...args: never[]) => unknown;

interface LoadedChild {
  load(): void;
  unload(): void;
}

interface MultiSelectComponentLike {
  renderValues(): void;
  rootEl: HTMLElement;
  values: string[];
}

type RenderFn = (el: HTMLElement, data: unknown, ctx: PropertyRenderContext) => unknown;

interface RenderValuesProto {
  renderValues: AnyFn;
}

interface WidgetWithRender {
  render: RenderFn;
}

// Children loaded via the mock plugin's `addChild`, tracked so they can be unloaded
// After each test to remove the real prototype patches the source installs.
const loadedChildren: LoadedChild[] = [];

vi.mock('obsidian-dev-utils/object-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('obsidian-dev-utils/object-utils')>();
  return {
    ...actual,
    getPrototypeOf: vi.fn().mockReturnValue({})
  };
});

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { patchMultiTextPropertyWidgetComponent } from './multi-text-property-widget-component.ts';

interface MultitextPropertyWidgetComponent {
  multiselect: object;
}

function createMockPlugin(): Plugin {
  // The real MonkeyAroundComponent throws on registerPatch unless it is loaded, so the
  // Mock plugin's addChild loads each child (the real lifecycle) and tracks it for unload.
  const addChildFn = vi.fn().mockImplementation(<T>(child: T): T => {
    castTo<LoadedChild>(child).load();
    loadedChildren.push(castTo<LoadedChild>(child));
    return child;
  });
  const mockWidget = {
    render: vi.fn().mockImplementation((_el: HTMLElement, _data: unknown, _ctx: PropertyRenderContext): MultitextPropertyWidgetComponent => ({
      multiselect: {}
    }))
  };
  const mockMetadataTypeManager = castTo<MetadataTypeManager>({
    registeredTypeWidgets: {
      multitext: mockWidget
    }
  });
  const app = castTo<App>({
    metadataCache: {
      getFirstLinkpathDest: vi.fn().mockReturnValue(null)
    },
    metadataTypeManager: mockMetadataTypeManager,
    workspace: {
      getActiveFile: vi.fn().mockReturnValue(null)
    }
  });

  return castTo<Plugin>({
    addChild: addChildFn,
    app
  });
}

function createMockPropertyRenderContext(): PropertyRenderContext {
  return strictProxy<PropertyRenderContext>({
    onChange: vi.fn(),
    sourcePath: 'test.md'
  });
}

afterEach(() => {
  // Unload all children loaded via addChild to remove the real prototype patches
  // (e.g. the multiselect prototype's renderValues) before the next test.
  for (const child of loadedChildren) {
    child.unload();
  }
  loadedChildren.length = 0;
});

describe('patchMultiTextPropertyWidgetComponent', () => {
  beforeEach(() => {
    // Reset module state between tests.
    vi.resetModules();
  });

  it('should create a MonkeyAroundComponent child on the plugin', async () => {
    // eslint-disable-next-line no-restricted-syntax -- Dynamic import required to re-read the module after vi.resetModules().
    const { MonkeyAroundComponent } = await import('obsidian-dev-utils/obsidian/components/monkey-around-component');
    // eslint-disable-next-line no-restricted-syntax -- Dynamic import required to re-read the module after vi.resetModules().
    const { patchMultiTextPropertyWidgetComponent: patchFn } = await import('./multi-text-property-widget-component.ts');
    const plugin = createMockPlugin();

    patchFn(plugin);

    expect(plugin.addChild).toHaveBeenCalledWith(expect.any(MonkeyAroundComponent));
  });

  it('should register a patch on the multitext widget', async () => {
    // eslint-disable-next-line no-restricted-syntax -- Dynamic import required to re-read the module after vi.resetModules().
    const { MonkeyAroundComponent } = await import('obsidian-dev-utils/obsidian/components/monkey-around-component');
    const spy = vi.spyOn(MonkeyAroundComponent.prototype, 'registerPatch');
    // eslint-disable-next-line no-restricted-syntax -- Dynamic import required to re-read the module after vi.resetModules().
    const { patchMultiTextPropertyWidgetComponent: patchFn } = await import('./multi-text-property-widget-component.ts');
    const plugin = createMockPlugin();

    patchFn(plugin);

    const multitextWidget: WidgetWithRender = plugin.app.metadataTypeManager.registeredTypeWidgets.multitext;
    expect(spy).toHaveBeenCalledWith(
      multitextWidget,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest asymmetric matchers (objectContaining/any) are typed as any.
      expect.objectContaining({ render: expect.any(Function) })
    );
  });
});

describe('render patch', () => {
  it('should call through to original render when widget is already patched', () => {
    const plugin = createMockPlugin();
    const multitextWidget = plugin.app.metadataTypeManager.registeredTypeWidgets.multitext as WidgetWithRender;
    const el = activeDocument.createElement('div');
    const ctx = createMockPropertyRenderContext();

    // First call patches the widget (isPatched becomes true).
    patchMultiTextPropertyWidgetComponent(plugin);

    // Simulate the second render call after patching.
    const result = multitextWidget.render(el, ['item1'], ctx);

    expect(result).toBeDefined();
  });

  it('should register a renderValues patch on the multiselect prototype on first render', async () => {
    vi.resetModules();
    const proto: RenderValuesProto = { renderValues: vi.fn() };
    // eslint-disable-next-line no-restricted-syntax -- Dynamic import required to re-read the mocked module after vi.resetModules().
    const objectUtils = await import('obsidian-dev-utils/object-utils');
    vi.mocked(objectUtils.getPrototypeOf).mockReturnValue(proto);
    // eslint-disable-next-line no-restricted-syntax -- Dynamic import required to re-read the module after vi.resetModules().
    const { patchMultiTextPropertyWidgetComponent: patchFn } = await import('./multi-text-property-widget-component.ts');
    const plugin = createMockPlugin();
    const multitextWidget = plugin.app.metadataTypeManager.registeredTypeWidgets.multitext as WidgetWithRender;
    const el = activeDocument.createElement('div');
    const ctx = createMockPropertyRenderContext();

    patchFn(plugin);
    const original = proto.renderValues;
    multitextWidget.render(el, ['item1'], ctx);

    // The prototype's renderValues should have been wrapped by the patch.
    expect(proto.renderValues).not.toBe(original);
  });
});

interface CapturePatchedRenderValuesResult {
  readonly app: App;
  patchedRenderValues(): void;
}

function addPill(rootEl: HTMLElement): HTMLElement {
  const pillEl = rootEl.createDiv('multi-select-pill');
  return pillEl.createDiv('multi-select-pill-content');
}

async function capturePatchedRenderValues(nextRenderValues: AnyFn): Promise<CapturePatchedRenderValuesResult> {
  vi.resetModules();
  const proto: RenderValuesProto = { renderValues: nextRenderValues };
  // eslint-disable-next-line no-restricted-syntax -- Dynamic import required to re-read the mocked module after vi.resetModules().
  const objectUtils = await import('obsidian-dev-utils/object-utils');
  vi.mocked(objectUtils.getPrototypeOf).mockReturnValue(proto);
  // eslint-disable-next-line no-restricted-syntax -- Dynamic import required to re-read the module after vi.resetModules().
  const { patchMultiTextPropertyWidgetComponent: patchFn } = await import('./multi-text-property-widget-component.ts');
  const plugin = createMockPlugin();
  const multitextWidget = plugin.app.metadataTypeManager.registeredTypeWidgets.multitext as WidgetWithRender;
  patchFn(plugin);
  multitextWidget.render(activeDocument.createElement('div'), ['item1'], createMockPropertyRenderContext());
  return {
    app: plugin.app,
    patchedRenderValues: proto.renderValues
  };
}

function createMultiSelectComponent(values: string[]): MultiSelectComponentLike {
  const rootEl = activeDocument.createElement('div');
  return {
    renderValues: vi.fn(),
    rootEl,
    values
  };
}

describe('renderValues', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(getPrototypeOf).mockReturnValue({});
  });

  it('should call the original renderValues', async () => {
    const next = vi.fn();
    const { patchedRenderValues } = await capturePatchedRenderValues(next);
    const component = createMultiSelectComponent([]);

    patchedRenderValues.call(component);

    expect(next).toHaveBeenCalled();
  });

  it('should skip empty values', async () => {
    const next = vi.fn().mockImplementation(function renderNext(this: MultiSelectComponentLike): void {
      addPill(this.rootEl);
    });
    const { patchedRenderValues } = await capturePatchedRenderValues(next);
    const component = createMultiSelectComponent(['']);

    patchedRenderValues.call(component);

    const contentEl = component.rootEl.querySelector('.multi-select-pill-content');
    expect(contentEl?.childElementCount).toBe(0);
  });

  it('should skip values with no parsed links', async () => {
    const next = vi.fn().mockImplementation(function renderNext(this: MultiSelectComponentLike): void {
      addPill(this.rootEl);
    });
    const { patchedRenderValues } = await capturePatchedRenderValues(next);
    const component = createMultiSelectComponent(['plain text']);

    patchedRenderValues.call(component);

    const contentEl = component.rootEl.querySelector('.multi-select-pill-content');
    expect(contentEl?.childElementCount).toBe(0);
  });

  it('should render a single internal link value', async () => {
    const next = vi.fn().mockImplementation(function renderNext(this: MultiSelectComponentLike): void {
      addPill(this.rootEl);
    });
    const { patchedRenderValues } = await capturePatchedRenderValues(next);
    const component = createMultiSelectComponent(['[note](target.md)']);

    patchedRenderValues.call(component);

    const contentEl = component.rootEl.querySelector('.multi-select-pill-content');
    expect(contentEl?.querySelector('span')?.textContent).toBe('note');
    expect(contentEl?.classList.contains('internal-link')).toBe(true);
  });

  it('should add is-unresolved class when internal link does not resolve', async () => {
    const next = vi.fn().mockImplementation(function renderNext(this: MultiSelectComponentLike): void {
      addPill(this.rootEl);
    });
    const { app, patchedRenderValues } = await capturePatchedRenderValues(next);
    vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValue(null);
    const component = createMultiSelectComponent(['[note](target.md)']);

    patchedRenderValues.call(component);

    const contentEl = component.rootEl.querySelector('.multi-select-pill-content');
    expect(contentEl?.classList.contains('is-unresolved')).toBe(true);
  });

  it('should not add is-unresolved class when internal link resolves', async () => {
    const next = vi.fn().mockImplementation(function renderNext(this: MultiSelectComponentLike): void {
      addPill(this.rootEl);
    });
    const { app, patchedRenderValues } = await capturePatchedRenderValues(next);
    vi.mocked(app.metadataCache.getFirstLinkpathDest).mockReturnValue(makeMockFile());
    const component = createMultiSelectComponent(['[note](target.md)']);

    patchedRenderValues.call(component);

    const contentEl = component.rootEl.querySelector('.multi-select-pill-content');
    expect(contentEl?.classList.contains('is-unresolved')).toBe(false);
  });

  it('should render a single external link value with external-link class', async () => {
    const next = vi.fn().mockImplementation(function renderNext(this: MultiSelectComponentLike): void {
      addPill(this.rootEl);
    });
    const { patchedRenderValues } = await capturePatchedRenderValues(next);
    const component = createMultiSelectComponent(['[ext](https://example.com)']);

    patchedRenderValues.call(component);

    const contentEl = component.rootEl.querySelector('.multi-select-pill-content');
    expect(contentEl?.classList.contains('external-link')).toBe(true);
  });

  it('should skip when no rendered pill element exists for a value', async () => {
    const next = vi.fn();
    const { patchedRenderValues } = await capturePatchedRenderValues(next);
    const component = createMultiSelectComponent(['[note](target.md)']);

    patchedRenderValues.call(component);

    expect(component.rootEl.querySelector('.multi-select-pill-content')).toBeNull();
  });

  it('should render multiple links inside a value with surrounding text', async () => {
    const next = vi.fn().mockImplementation(function renderNext(this: MultiSelectComponentLike): void {
      addPill(this.rootEl);
    });
    const { patchedRenderValues } = await capturePatchedRenderValues(next);
    const component = createMultiSelectComponent(['text [a](x.md) and [b](y.md)']);

    patchedRenderValues.call(component);

    const contentEl = component.rootEl.querySelector('.multi-select-pill-content');
    expect(contentEl?.classList.contains('multi-text-property-component')).toBe(true);
    expect(contentEl?.querySelectorAll('div').length).toBeGreaterThan(1);
  });

  it('should skip the patch block on a subsequent render once already patched', async () => {
    const proto: RenderValuesProto = { renderValues: vi.fn() };
    // eslint-disable-next-line no-restricted-syntax -- Dynamic import required to re-read the mocked module after vi.resetModules().
    const objectUtils = await import('obsidian-dev-utils/object-utils');
    const getPrototypeOfMock = vi.mocked(objectUtils.getPrototypeOf);
    getPrototypeOfMock.mockReturnValue(proto);
    // eslint-disable-next-line no-restricted-syntax -- Dynamic import required to re-read the module after vi.resetModules().
    const { patchMultiTextPropertyWidgetComponent: patchFn } = await import('./multi-text-property-widget-component.ts');
    const plugin = createMockPlugin();
    const multitextWidget = plugin.app.metadataTypeManager.registeredTypeWidgets.multitext as WidgetWithRender;
    patchFn(plugin);

    // First render patches; second render must skip the patch block (isPatched === true).
    multitextWidget.render(activeDocument.createElement('div'), ['item1'], createMockPropertyRenderContext());
    getPrototypeOfMock.mockClear();
    multitextWidget.render(activeDocument.createElement('div'), ['item2'], createMockPropertyRenderContext());

    // The patch block (which calls getPrototypeOf) must not run again.
    expect(getPrototypeOfMock).not.toHaveBeenCalled();
  });

  it('should render trailing text after the last link', async () => {
    const next = vi.fn().mockImplementation(function renderNext(this: MultiSelectComponentLike): void {
      addPill(this.rootEl);
    });
    const { patchedRenderValues } = await capturePatchedRenderValues(next);
    const component = createMultiSelectComponent(['[a](x.md) and [b](y.md) trailing']);

    patchedRenderValues.call(component);

    const contentEl = component.rootEl.querySelector('.multi-select-pill-content');
    const divs = Array.from(contentEl?.querySelectorAll('div') ?? []);
    expect(divs.some((divEl) => divEl.textContent.includes('trailing'))).toBe(true);
  });

  it('should stop click propagation unless the remove button is clicked', async () => {
    const next = vi.fn().mockImplementation(function renderNext(this: MultiSelectComponentLike): void {
      addPill(this.rootEl);
    });
    const { patchedRenderValues } = await capturePatchedRenderValues(next);
    const component = createMultiSelectComponent(['text [a](x.md) and [b](y.md)']);

    patchedRenderValues.call(component);

    const pillEl = ensureNonNullable(component.rootEl.querySelector('.multi-select-pill'));
    const clickEvt = new MouseEvent('click', { bubbles: true });
    const stopSpy = vi.spyOn(clickEvt, 'stopPropagation');
    pillEl.dispatchEvent(clickEvt);

    expect(stopSpy).toHaveBeenCalled();
  });

  it('should not stop click propagation when remove button is clicked', async () => {
    const next = vi.fn().mockImplementation(function renderNext(this: MultiSelectComponentLike): void {
      addPill(this.rootEl);
    });
    const { patchedRenderValues } = await capturePatchedRenderValues(next);
    const component = createMultiSelectComponent(['text [a](x.md) and [b](y.md)']);

    patchedRenderValues.call(component);

    const pillEl = ensureNonNullable(component.rootEl.querySelector('.multi-select-pill'));
    const removeButtonEl = pillEl.createDiv('multi-select-pill-remove-button');
    const clickEvt = new MouseEvent('click', { bubbles: true });
    const stopSpy = vi.spyOn(clickEvt, 'stopPropagation');
    removeButtonEl.dispatchEvent(clickEvt);

    expect(stopSpy).not.toHaveBeenCalled();
  });

  it('should ignore clicks whose target is not an Element', async () => {
    const next = vi.fn().mockImplementation(function renderNext(this: MultiSelectComponentLike): void {
      addPill(this.rootEl);
    });
    const { patchedRenderValues } = await capturePatchedRenderValues(next);
    const component = createMultiSelectComponent(['text [a](x.md) and [b](y.md)']);

    patchedRenderValues.call(component);

    const pillEl = ensureNonNullable(component.rootEl.querySelector('.multi-select-pill'));
    const clickEvt = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(clickEvt, 'target', { value: null });
    const stopSpy = vi.spyOn(clickEvt, 'stopPropagation');
    pillEl.dispatchEvent(clickEvt);

    expect(stopSpy).not.toHaveBeenCalled();
  });

  it('should stop mouseover propagation on the pill', async () => {
    const next = vi.fn().mockImplementation(function renderNext(this: MultiSelectComponentLike): void {
      addPill(this.rootEl);
    });
    const { patchedRenderValues } = await capturePatchedRenderValues(next);
    const component = createMultiSelectComponent(['text [a](x.md) and [b](y.md)']);

    patchedRenderValues.call(component);

    const pillEl = ensureNonNullable(component.rootEl.querySelector('.multi-select-pill'));
    const overEvt = new MouseEvent('mouseover', { bubbles: true });
    const stopSpy = vi.spyOn(overEvt, 'stopPropagation');
    pillEl.dispatchEvent(overEvt);

    expect(stopSpy).toHaveBeenCalled();
  });

  it('should skip when a multi-link pill content element has no parent', async () => {
    const orphanContentEl = activeDocument.createElement('div');
    orphanContentEl.addClass('multi-select-pill-content');
    const next = vi.fn().mockImplementation(function renderNext(this: MultiSelectComponentLike): void {
      // Attach a detached content element to rootEl via a fragment so it has no parentElement.
      this.rootEl.appendChild(orphanContentEl);
      this.rootEl.removeChild(orphanContentEl);
      const querySpy = vi.spyOn(this.rootEl, 'querySelectorAll');
      querySpy.mockReturnValue(castTo<NodeListOf<Element>>([orphanContentEl]));
    });
    const { patchedRenderValues } = await capturePatchedRenderValues(next);
    const component = createMultiSelectComponent(['text [a](x.md) and [b](y.md)']);

    patchedRenderValues.call(component);

    expect(orphanContentEl.parentElement).toBeNull();
  });
});

function makeMockFile(): ReturnType<App['metadataCache']['getFirstLinkpathDest']> {
  return castTo<ReturnType<App['metadataCache']['getFirstLinkpathDest']>>({ path: 'target.md' });
}

import type { Multiselect } from '@obsidian-typings/obsidian-public-latest';
import type { App } from 'obsidian';

import { castTo } from 'obsidian-dev-utils/object-utils';
import { strictProxy } from 'obsidian-dev-utils/strict-proxy';
import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';
import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { MultiTextPropertyComponentRenderValuesPatchComponent } from './multi-text-property-component-render-values-patch-component.ts';

type GetFirstLinkpathDestination = App['metadataCache']['getFirstLinkpathDest'];

interface MultiselectLike {
  rootEl: HTMLElement;
  values: string[];
}

type RenderValuesFunction = (this: MultiselectLike) => void;

interface RenderValuesPrototype {
  renderValues: RenderValuesFunction;
}

let loadedComponent: MultiTextPropertyComponentRenderValuesPatchComponent | null = null;

afterEach(() => {
  loadedComponent?.unload();
  loadedComponent = null;
  vi.restoreAllMocks();
});

function addPill(rootEl: HTMLElement): HTMLElement {
  const pillEl = rootEl.createDiv('multi-select-pill');
  return pillEl.createDiv('multi-select-pill-content');
}

function buildRenderValuesMock(): RenderValuesFunction {
  return vi.fn(function renderValues(this: MultiselectLike): void {
    for (const value of this.values) {
      const contentEl = addPill(this.rootEl);
      contentEl.setText(value);
    }
  });
}

function callRenderValues(prototype: RenderValuesPrototype, target: MultiselectLike): void {
  castTo<RenderValuesFunction>(prototype.renderValues).call(target);
}

function createTarget(prototype: RenderValuesPrototype, values: string[]): MultiselectLike {
  const target = castTo<MultiselectLike>(Object.create(prototype));
  target.rootEl = createDiv();
  target.values = values;
  return target;
}

function loadPatch(prototype: RenderValuesPrototype, getFirstLinkpathDestination: GetFirstLinkpathDestination = vi.fn().mockReturnValue(null)): void {
  // The component patches `getPrototypeOf(this.multiselect).renderValues`, so a multiselect whose
  // Prototype is `proto` makes the patch install on `proto.renderValues`.
  const multiselect = castTo<Multiselect>(Object.create(prototype));
  const app = strictProxy<App>({
    metadataCache: {
      // eslint-disable-next-line unicorn/name-replacements -- `getFirstLinkpathDest` is an Obsidian `MetadataCache` method name.
      getFirstLinkpathDest: getFirstLinkpathDestination
    },
    workspace: {
      getActiveFile: vi.fn().mockReturnValue(null)
    }
  });
  const component = new MultiTextPropertyComponentRenderValuesPatchComponent({ app, multiselect });
  component.load();
  loadedComponent = component;
}

describe('MultiTextPropertyComponentRenderValuesPatchComponent', () => {
  it('should call the original renderValues', () => {
    const prototype: RenderValuesPrototype = { renderValues: vi.fn() };
    const original = prototype.renderValues;
    loadPatch(prototype);

    const target = createTarget(prototype, []);
    callRenderValues(prototype, target);

    expect(original).toHaveBeenCalledTimes(1);
  });

  it('should skip empty values', () => {
    const prototype: RenderValuesPrototype = { renderValues: buildRenderValuesMock() };
    loadPatch(prototype);

    const target = createTarget(prototype, ['']);
    callRenderValues(prototype, target);

    const contentEl = target.rootEl.querySelector('.multi-select-pill-content');
    expect(contentEl?.textContent).toBe('');
  });

  it('should skip values with no parsed links', () => {
    const prototype: RenderValuesPrototype = { renderValues: buildRenderValuesMock() };
    loadPatch(prototype);

    const target = createTarget(prototype, ['plain text']);
    callRenderValues(prototype, target);

    const contentEl = target.rootEl.querySelector('.multi-select-pill-content');
    expect(contentEl?.querySelector('span')).toBeNull();
  });

  it('should skip when no rendered pill element exists for a value', () => {
    const prototype: RenderValuesPrototype = { renderValues: vi.fn() };
    loadPatch(prototype);

    const target = createTarget(prototype, ['[note](target.md)']);
    callRenderValues(prototype, target);

    expect(target.rootEl.querySelector('.multi-select-pill-content')).toBeNull();
  });

  it('should render a single internal link value with internal-link class', () => {
    const prototype: RenderValuesPrototype = { renderValues: buildRenderValuesMock() };
    loadPatch(prototype);

    const target = createTarget(prototype, ['[note](target.md)']);
    callRenderValues(prototype, target);

    const contentEl = target.rootEl.querySelector('.multi-select-pill-content');
    expect(contentEl?.querySelector('span')?.textContent).toBe('note');
    expect(contentEl?.classList.contains('internal-link')).toBe(true);
  });

  it('should add is-unresolved class when a single internal link does not resolve', () => {
    const prototype: RenderValuesPrototype = { renderValues: buildRenderValuesMock() };
    loadPatch(prototype, vi.fn().mockReturnValue(null));

    const target = createTarget(prototype, ['[note](target.md)']);
    callRenderValues(prototype, target);

    const contentEl = target.rootEl.querySelector('.multi-select-pill-content');
    expect(contentEl?.classList.contains('is-unresolved')).toBe(true);
  });

  it('should not add is-unresolved class when a single internal link resolves', () => {
    const prototype: RenderValuesPrototype = { renderValues: buildRenderValuesMock() };
    loadPatch(prototype, vi.fn().mockReturnValue(castTo<ReturnType<GetFirstLinkpathDestination>>({ path: 'target.md' })));

    const target = createTarget(prototype, ['[note](target.md)']);
    callRenderValues(prototype, target);

    const contentEl = target.rootEl.querySelector('.multi-select-pill-content');
    expect(contentEl?.classList.contains('is-unresolved')).toBe(false);
  });

  it('should render a single external link value with external-link class', () => {
    const prototype: RenderValuesPrototype = { renderValues: buildRenderValuesMock() };
    loadPatch(prototype);

    const target = createTarget(prototype, ['[ext](https://example.com)']);
    callRenderValues(prototype, target);

    const contentEl = target.rootEl.querySelector('.multi-select-pill-content');
    expect(contentEl?.classList.contains('external-link')).toBe(true);
  });

  it('should render multiple links inside a value with surrounding text', () => {
    const prototype: RenderValuesPrototype = { renderValues: buildRenderValuesMock() };
    loadPatch(prototype);

    const target = createTarget(prototype, ['text [a](x.md) and [b](y.md)']);
    callRenderValues(prototype, target);

    const contentEl = target.rootEl.querySelector('.multi-select-pill-content');
    expect(contentEl?.classList.contains('multi-text-property-component')).toBe(true);
    expect(contentEl?.querySelectorAll('div').length ?? 0).toBeGreaterThan(1);
  });

  it('should render trailing text after the last link in a multi-link value', () => {
    const prototype: RenderValuesPrototype = { renderValues: buildRenderValuesMock() };
    loadPatch(prototype);

    const target = createTarget(prototype, ['[a](x.md) and [b](y.md) trailing']);
    callRenderValues(prototype, target);

    const contentEl = target.rootEl.querySelector('.multi-select-pill-content');
    const divs = [...contentEl?.querySelectorAll('div') ?? []];
    expect(divs.some((divEl) => divEl.textContent.includes('trailing'))).toBe(true);
  });

  it('should add is-unresolved on an internal link inside a multi-link value', () => {
    const prototype: RenderValuesPrototype = { renderValues: buildRenderValuesMock() };
    loadPatch(prototype, vi.fn().mockReturnValue(null));

    const target = createTarget(prototype, ['text [a](x.md) and external [b](https://example.com)']);
    callRenderValues(prototype, target);

    const contentEl = target.rootEl.querySelector('.multi-select-pill-content');
    const unresolvedChild = contentEl?.querySelector('.is-unresolved');
    expect(unresolvedChild).not.toBeNull();
    const externalChild = contentEl?.querySelector('.external-link');
    expect(externalChild).not.toBeNull();
  });

  it('should skip when a multi-link pill content element has no parent', () => {
    const orphanContentEl = createDiv();
    orphanContentEl.addClass('multi-select-pill-content');
    const prototype: RenderValuesPrototype = {
      renderValues: vi.fn(function renderValues(this: MultiselectLike): void {
        // Make the only rendered pill content element have no parent so the parent guard short-circuits.
        const querySpy = vi.spyOn(this.rootEl, 'querySelectorAll');
        querySpy.mockReturnValue(castTo<NodeListOf<Element>>([orphanContentEl]));
      })
    };
    loadPatch(prototype);

    const target = createTarget(prototype, ['text [a](x.md) and [b](y.md)']);
    callRenderValues(prototype, target);

    expect(orphanContentEl.parentElement).toBeNull();
  });

  it('should stop mouseover propagation on the pill', () => {
    const prototype: RenderValuesPrototype = { renderValues: buildRenderValuesMock() };
    loadPatch(prototype);

    const target = createTarget(prototype, ['text [a](x.md) and [b](y.md)']);
    callRenderValues(prototype, target);

    const pillEl = ensureNonNullable(target.rootEl.querySelector('.multi-select-pill'));
    const overEvent = new MouseEvent('mouseover', { bubbles: true });
    const stopSpy = vi.spyOn(overEvent, 'stopPropagation');
    pillEl.dispatchEvent(overEvent);

    expect(stopSpy).toHaveBeenCalled();
  });

  it('should stop click propagation unless the remove button is clicked', () => {
    const prototype: RenderValuesPrototype = { renderValues: buildRenderValuesMock() };
    loadPatch(prototype);

    const target = createTarget(prototype, ['text [a](x.md) and [b](y.md)']);
    callRenderValues(prototype, target);

    const pillEl = ensureNonNullable(target.rootEl.querySelector('.multi-select-pill'));
    const clickEvent = new MouseEvent('click', { bubbles: true });
    const stopSpy = vi.spyOn(clickEvent, 'stopPropagation');
    pillEl.dispatchEvent(clickEvent);

    expect(stopSpy).toHaveBeenCalled();
  });

  it('should not stop click propagation when the remove button is clicked', () => {
    const prototype: RenderValuesPrototype = { renderValues: buildRenderValuesMock() };
    loadPatch(prototype);

    const target = createTarget(prototype, ['text [a](x.md) and [b](y.md)']);
    callRenderValues(prototype, target);

    const pillEl = ensureNonNullable(target.rootEl.querySelector('.multi-select-pill'));
    const removeButtonEl = pillEl.createDiv('multi-select-pill-remove-button');
    const clickEvent = new MouseEvent('click', { bubbles: true });
    const stopSpy = vi.spyOn(clickEvent, 'stopPropagation');
    removeButtonEl.dispatchEvent(clickEvent);

    expect(stopSpy).not.toHaveBeenCalled();
  });

  it('should ignore clicks whose target is not an Element', () => {
    const prototype: RenderValuesPrototype = { renderValues: buildRenderValuesMock() };
    loadPatch(prototype);

    const target = createTarget(prototype, ['text [a](x.md) and [b](y.md)']);
    callRenderValues(prototype, target);

    const pillEl = ensureNonNullable(target.rootEl.querySelector('.multi-select-pill'));
    const clickEvent = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(clickEvent, 'target', { value: null });
    const stopSpy = vi.spyOn(clickEvent, 'stopPropagation');
    pillEl.dispatchEvent(clickEvent);

    expect(stopSpy).not.toHaveBeenCalled();
  });
});

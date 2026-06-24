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

type GetFirstLinkpathDest = App['metadataCache']['getFirstLinkpathDest'];

interface MultiselectLike {
  rootEl: HTMLElement;
  values: string[];
}

type RenderValuesFn = (this: MultiselectLike) => void;

interface RenderValuesProto {
  renderValues: RenderValuesFn;
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

function buildRenderValuesMock(): RenderValuesFn {
  return vi.fn(function renderValues(this: MultiselectLike): void {
    for (const value of this.values) {
      const contentEl = addPill(this.rootEl);
      contentEl.setText(value);
    }
  });
}

function callRenderValues(proto: RenderValuesProto, target: MultiselectLike): void {
  castTo<RenderValuesFn>(proto.renderValues).call(target);
}

function createTarget(proto: RenderValuesProto, values: string[]): MultiselectLike {
  const target = castTo<MultiselectLike>(Object.create(proto));
  target.rootEl = activeDocument.createElement('div');
  target.values = values;
  return target;
}

function loadPatch(proto: RenderValuesProto, getFirstLinkpathDest: GetFirstLinkpathDest = vi.fn().mockReturnValue(null)): void {
  // The component patches `getPrototypeOf(this.multiselect).renderValues`, so a multiselect whose
  // Prototype is `proto` makes the patch install on `proto.renderValues`.
  const multiselect = castTo<Multiselect>(Object.create(proto));
  const app = strictProxy<App>({
    metadataCache: {
      getFirstLinkpathDest
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
    const proto: RenderValuesProto = { renderValues: vi.fn() };
    const original = proto.renderValues;
    loadPatch(proto);

    const target = createTarget(proto, []);
    callRenderValues(proto, target);

    expect(original).toHaveBeenCalledTimes(1);
  });

  it('should skip empty values', () => {
    const proto: RenderValuesProto = { renderValues: buildRenderValuesMock() };
    loadPatch(proto);

    const target = createTarget(proto, ['']);
    callRenderValues(proto, target);

    const contentEl = target.rootEl.querySelector('.multi-select-pill-content');
    expect(contentEl?.textContent).toBe('');
  });

  it('should skip values with no parsed links', () => {
    const proto: RenderValuesProto = { renderValues: buildRenderValuesMock() };
    loadPatch(proto);

    const target = createTarget(proto, ['plain text']);
    callRenderValues(proto, target);

    const contentEl = target.rootEl.querySelector('.multi-select-pill-content');
    expect(contentEl?.querySelector('span')).toBeNull();
  });

  it('should skip when no rendered pill element exists for a value', () => {
    const proto: RenderValuesProto = { renderValues: vi.fn() };
    loadPatch(proto);

    const target = createTarget(proto, ['[note](target.md)']);
    callRenderValues(proto, target);

    expect(target.rootEl.querySelector('.multi-select-pill-content')).toBeNull();
  });

  it('should render a single internal link value with internal-link class', () => {
    const proto: RenderValuesProto = { renderValues: buildRenderValuesMock() };
    loadPatch(proto);

    const target = createTarget(proto, ['[note](target.md)']);
    callRenderValues(proto, target);

    const contentEl = target.rootEl.querySelector('.multi-select-pill-content');
    expect(contentEl?.querySelector('span')?.textContent).toBe('note');
    expect(contentEl?.classList.contains('internal-link')).toBe(true);
  });

  it('should add is-unresolved class when a single internal link does not resolve', () => {
    const proto: RenderValuesProto = { renderValues: buildRenderValuesMock() };
    loadPatch(proto, vi.fn().mockReturnValue(null));

    const target = createTarget(proto, ['[note](target.md)']);
    callRenderValues(proto, target);

    const contentEl = target.rootEl.querySelector('.multi-select-pill-content');
    expect(contentEl?.classList.contains('is-unresolved')).toBe(true);
  });

  it('should not add is-unresolved class when a single internal link resolves', () => {
    const proto: RenderValuesProto = { renderValues: buildRenderValuesMock() };
    loadPatch(proto, vi.fn().mockReturnValue(castTo<ReturnType<GetFirstLinkpathDest>>({ path: 'target.md' })));

    const target = createTarget(proto, ['[note](target.md)']);
    callRenderValues(proto, target);

    const contentEl = target.rootEl.querySelector('.multi-select-pill-content');
    expect(contentEl?.classList.contains('is-unresolved')).toBe(false);
  });

  it('should render a single external link value with external-link class', () => {
    const proto: RenderValuesProto = { renderValues: buildRenderValuesMock() };
    loadPatch(proto);

    const target = createTarget(proto, ['[ext](https://example.com)']);
    callRenderValues(proto, target);

    const contentEl = target.rootEl.querySelector('.multi-select-pill-content');
    expect(contentEl?.classList.contains('external-link')).toBe(true);
  });

  it('should render multiple links inside a value with surrounding text', () => {
    const proto: RenderValuesProto = { renderValues: buildRenderValuesMock() };
    loadPatch(proto);

    const target = createTarget(proto, ['text [a](x.md) and [b](y.md)']);
    callRenderValues(proto, target);

    const contentEl = target.rootEl.querySelector('.multi-select-pill-content');
    expect(contentEl?.classList.contains('multi-text-property-component')).toBe(true);
    expect(contentEl?.querySelectorAll('div').length ?? 0).toBeGreaterThan(1);
  });

  it('should render trailing text after the last link in a multi-link value', () => {
    const proto: RenderValuesProto = { renderValues: buildRenderValuesMock() };
    loadPatch(proto);

    const target = createTarget(proto, ['[a](x.md) and [b](y.md) trailing']);
    callRenderValues(proto, target);

    const contentEl = target.rootEl.querySelector('.multi-select-pill-content');
    const divs = Array.from(contentEl?.querySelectorAll('div') ?? []);
    expect(divs.some((divEl) => divEl.textContent.includes('trailing'))).toBe(true);
  });

  it('should add is-unresolved on an internal link inside a multi-link value', () => {
    const proto: RenderValuesProto = { renderValues: buildRenderValuesMock() };
    loadPatch(proto, vi.fn().mockReturnValue(null));

    const target = createTarget(proto, ['text [a](x.md) and external [b](https://example.com)']);
    callRenderValues(proto, target);

    const contentEl = target.rootEl.querySelector('.multi-select-pill-content');
    const unresolvedChild = contentEl?.querySelector('.is-unresolved');
    expect(unresolvedChild).not.toBeNull();
    const externalChild = contentEl?.querySelector('.external-link');
    expect(externalChild).not.toBeNull();
  });

  it('should skip when a multi-link pill content element has no parent', () => {
    const orphanContentEl = activeDocument.createElement('div');
    orphanContentEl.addClass('multi-select-pill-content');
    const proto: RenderValuesProto = {
      renderValues: vi.fn(function renderValues(this: MultiselectLike): void {
        // Make the only rendered pill content element have no parent so the parent guard short-circuits.
        const querySpy = vi.spyOn(this.rootEl, 'querySelectorAll');
        querySpy.mockReturnValue(castTo<NodeListOf<Element>>([orphanContentEl]));
      })
    };
    loadPatch(proto);

    const target = createTarget(proto, ['text [a](x.md) and [b](y.md)']);
    callRenderValues(proto, target);

    expect(orphanContentEl.parentElement).toBeNull();
  });

  it('should stop mouseover propagation on the pill', () => {
    const proto: RenderValuesProto = { renderValues: buildRenderValuesMock() };
    loadPatch(proto);

    const target = createTarget(proto, ['text [a](x.md) and [b](y.md)']);
    callRenderValues(proto, target);

    const pillEl = ensureNonNullable(target.rootEl.querySelector('.multi-select-pill'));
    const overEvt = new MouseEvent('mouseover', { bubbles: true });
    const stopSpy = vi.spyOn(overEvt, 'stopPropagation');
    pillEl.dispatchEvent(overEvt);

    expect(stopSpy).toHaveBeenCalled();
  });

  it('should stop click propagation unless the remove button is clicked', () => {
    const proto: RenderValuesProto = { renderValues: buildRenderValuesMock() };
    loadPatch(proto);

    const target = createTarget(proto, ['text [a](x.md) and [b](y.md)']);
    callRenderValues(proto, target);

    const pillEl = ensureNonNullable(target.rootEl.querySelector('.multi-select-pill'));
    const clickEvt = new MouseEvent('click', { bubbles: true });
    const stopSpy = vi.spyOn(clickEvt, 'stopPropagation');
    pillEl.dispatchEvent(clickEvt);

    expect(stopSpy).toHaveBeenCalled();
  });

  it('should not stop click propagation when the remove button is clicked', () => {
    const proto: RenderValuesProto = { renderValues: buildRenderValuesMock() };
    loadPatch(proto);

    const target = createTarget(proto, ['text [a](x.md) and [b](y.md)']);
    callRenderValues(proto, target);

    const pillEl = ensureNonNullable(target.rootEl.querySelector('.multi-select-pill'));
    const removeButtonEl = pillEl.createDiv('multi-select-pill-remove-button');
    const clickEvt = new MouseEvent('click', { bubbles: true });
    const stopSpy = vi.spyOn(clickEvt, 'stopPropagation');
    removeButtonEl.dispatchEvent(clickEvt);

    expect(stopSpy).not.toHaveBeenCalled();
  });

  it('should ignore clicks whose target is not an Element', () => {
    const proto: RenderValuesProto = { renderValues: buildRenderValuesMock() };
    loadPatch(proto);

    const target = createTarget(proto, ['text [a](x.md) and [b](y.md)']);
    callRenderValues(proto, target);

    const pillEl = ensureNonNullable(target.rootEl.querySelector('.multi-select-pill'));
    const clickEvt = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(clickEvt, 'target', { value: null });
    const stopSpy = vi.spyOn(clickEvt, 'stopPropagation');
    pillEl.dispatchEvent(clickEvt);

    expect(stopSpy).not.toHaveBeenCalled();
  });
});

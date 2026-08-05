import type { TextPropertyWidgetComponent } from '@obsidian-typings/obsidian-public-latest';

import { castTo } from 'obsidian-dev-utils/object-utils';
import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { TextPropertyWidgetComponentRenderPatchComponent } from './text-property-widget-component-render-patch-component.ts';

type RenderFunction = (this: TextPropertyWidgetComponent) => void;

interface RenderPrototype {
  render: RenderFunction;
}

let loadedComponent: null | TextPropertyWidgetComponentRenderPatchComponent = null;

afterEach(() => {
  loadedComponent?.unload();
  loadedComponent = null;
  vi.restoreAllMocks();
});

function callRender(prototype: RenderPrototype, target: TextPropertyWidgetComponent): void {
  castTo<RenderFunction>(prototype.render).call(target);
}

function createTarget(prototype: RenderPrototype, value: string): TextPropertyWidgetComponent {
  const target = Object.create(prototype) as TextPropertyWidgetComponent;
  target.value = value;
  return target;
}

function loadPatch(prototype: RenderPrototype): void {
  // The component patches `getPrototypeOf(textPropertyWidgetComponent).render`, so an instance whose
  // Prototype is `proto` makes the patch install on `proto.render`.
  const textPropertyWidgetComponent = Object.create(prototype) as TextPropertyWidgetComponent;
  const component = new TextPropertyWidgetComponentRenderPatchComponent({ textPropertyWidgetComponent });
  component.load();
  loadedComponent = component;
}

describe('TextPropertyWidgetComponentRenderPatchComponent', () => {
  it('should normalize an angle-bracket external link value before falling back', () => {
    const prototype: RenderPrototype = { render: vi.fn() };
    const original = prototype.render;
    loadPatch(prototype);

    const target = createTarget(prototype, '<https://example.com>');
    callRender(prototype, target);

    expect(target.value).toBe('https://example.com');
    expect(original).toHaveBeenCalledTimes(1);
  });

  it('should strip the leading exclamation mark from an embed value before falling back', () => {
    const prototype: RenderPrototype = { render: vi.fn() };
    const original = prototype.render;
    loadPatch(prototype);

    const target = createTarget(prototype, '![[note]]');
    callRender(prototype, target);

    expect(target.value).toBe('[[note]]');
    expect(original).toHaveBeenCalledTimes(1);
  });

  it('should leave a plain value unchanged before falling back', () => {
    const prototype: RenderPrototype = { render: vi.fn() };
    const original = prototype.render;
    loadPatch(prototype);

    const target = createTarget(prototype, 'plain');
    callRender(prototype, target);

    expect(target.value).toBe('plain');
    expect(original).toHaveBeenCalledTimes(1);
  });

  it('should leave an empty value unchanged before falling back', () => {
    const prototype: RenderPrototype = { render: vi.fn() };
    const original = prototype.render;
    loadPatch(prototype);

    const target = createTarget(prototype, '');
    callRender(prototype, target);

    expect(target.value).toBe('');
    expect(original).toHaveBeenCalledTimes(1);
  });
});

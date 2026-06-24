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

type RenderFn = (this: TextPropertyWidgetComponent) => void;

interface RenderProto {
  render: RenderFn;
}

let loadedComponent: null | TextPropertyWidgetComponentRenderPatchComponent = null;

afterEach(() => {
  loadedComponent?.unload();
  loadedComponent = null;
  vi.restoreAllMocks();
});

function callRender(proto: RenderProto, target: TextPropertyWidgetComponent): void {
  castTo<RenderFn>(proto.render).call(target);
}

function createTarget(proto: RenderProto, value: string): TextPropertyWidgetComponent {
  const target = Object.create(proto) as TextPropertyWidgetComponent;
  target.value = value;
  return target;
}

function loadPatch(proto: RenderProto): void {
  // The component patches `getPrototypeOf(textPropertyWidgetComponent).render`, so an instance whose
  // Prototype is `proto` makes the patch install on `proto.render`.
  const textPropertyWidgetComponent = Object.create(proto) as TextPropertyWidgetComponent;
  const component = new TextPropertyWidgetComponentRenderPatchComponent({ textPropertyWidgetComponent });
  component.load();
  loadedComponent = component;
}

describe('TextPropertyWidgetComponentRenderPatchComponent', () => {
  it('should normalize an angle-bracket external link value before falling back', () => {
    const proto: RenderProto = { render: vi.fn() };
    const original = proto.render;
    loadPatch(proto);

    const target = createTarget(proto, '<https://example.com>');
    callRender(proto, target);

    expect(target.value).toBe('https://example.com');
    expect(original).toHaveBeenCalledTimes(1);
  });

  it('should strip the leading exclamation mark from an embed value before falling back', () => {
    const proto: RenderProto = { render: vi.fn() };
    const original = proto.render;
    loadPatch(proto);

    const target = createTarget(proto, '![[note]]');
    callRender(proto, target);

    expect(target.value).toBe('[[note]]');
    expect(original).toHaveBeenCalledTimes(1);
  });

  it('should leave a plain value unchanged before falling back', () => {
    const proto: RenderProto = { render: vi.fn() };
    const original = proto.render;
    loadPatch(proto);

    const target = createTarget(proto, 'plain');
    callRender(proto, target);

    expect(target.value).toBe('plain');
    expect(original).toHaveBeenCalledTimes(1);
  });

  it('should leave an empty value unchanged before falling back', () => {
    const proto: RenderProto = { render: vi.fn() };
    const original = proto.render;
    loadPatch(proto);

    const target = createTarget(proto, '');
    callRender(proto, target);

    expect(target.value).toBe('');
    expect(original).toHaveBeenCalledTimes(1);
  });
});

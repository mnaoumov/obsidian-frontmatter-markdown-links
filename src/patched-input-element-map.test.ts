import {
  describe,
  expect,
  it
} from 'vitest';

import { PatchedInputElementMap } from './patched-input-element-map.ts';

function createInputEl(): HTMLDivElement {
  return activeDocument.createDiv();
}

describe('PatchedInputElementMap', () => {
  describe('has', () => {
    it('should return false for an element that was never registered', () => {
      const map = new PatchedInputElementMap();

      expect(map.has(createInputEl())).toBe(false);
    });

    it('should return true after an offset is set', () => {
      const map = new PatchedInputElementMap();
      const inputEl = createInputEl();
      map.setOffset(inputEl, { from: 0, to: 0 });

      expect(map.has(inputEl)).toBe(true);
    });
  });

  describe('getOffset', () => {
    it('should return null for an element that was never registered', () => {
      const map = new PatchedInputElementMap();

      expect(map.getOffset(createInputEl())).toBeNull();
    });

    it('should return the offset that was set', () => {
      const map = new PatchedInputElementMap();
      const inputEl = createInputEl();
      const offset = { from: 3, to: 7 };
      map.setOffset(inputEl, offset);

      expect(map.getOffset(inputEl)).toEqual(offset);
    });

    it('should return the latest offset after overwriting', () => {
      const map = new PatchedInputElementMap();
      const inputEl = createInputEl();
      map.setOffset(inputEl, { from: 1, to: 2 });
      map.setOffset(inputEl, { from: 5, to: 9 });

      expect(map.getOffset(inputEl)).toEqual({ from: 5, to: 9 });
    });
  });
});

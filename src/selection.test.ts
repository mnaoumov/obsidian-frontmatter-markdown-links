import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { getCaretCharacterOffset } from './selection.ts';

describe('getCaretCharacterOffset', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return 0 when there is no selection', () => {
    vi.spyOn(window, 'getSelection').mockReturnValue(null);

    expect(getCaretCharacterOffset()).toBe(0);
  });

  it('should return 0 when the selection has no ranges', () => {
    const el = activeDocument.createElement('div');
    activeDocument.body.appendChild(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();

    expect(getCaretCharacterOffset()).toBe(0);

    el.remove();
  });

  it('should return the start offset of the first range', () => {
    const el = activeDocument.createElement('div');
    el.textContent = 'Hello world';
    activeDocument.body.appendChild(el);

    const range = activeDocument.createRange();
    const textNode = el.firstChild;
    if (!textNode) {
      throw new Error('expected a text node');
    }
    const EXPECTED_OFFSET = 5;
    range.setStart(textNode, EXPECTED_OFFSET);
    range.collapse(true);

    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    expect(getCaretCharacterOffset()).toBe(EXPECTED_OFFSET);

    el.remove();
  });
});

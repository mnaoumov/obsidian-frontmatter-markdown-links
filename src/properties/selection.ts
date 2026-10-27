export function getCaretCharacterOffset(): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) {
    return 0;
  }
  const range = sel.getRangeAt(0);
  return range.startOffset;
}

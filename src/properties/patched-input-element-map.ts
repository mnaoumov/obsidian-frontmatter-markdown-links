interface Offset {
  readonly from: number;
  readonly to: number;
}

export class PatchedInputElementMap {
  private readonly map = new WeakMap<HTMLDivElement, Offset>();

  public getOffset(inputEl: HTMLDivElement): null | Offset {
    return this.map.get(inputEl) ?? null;
  }

  public has(inputEl: HTMLDivElement): boolean {
    return this.map.has(inputEl);
  }

  public setOffset(inputEl: HTMLDivElement, offset: Offset): void {
    this.map.set(inputEl, offset);
  }
}

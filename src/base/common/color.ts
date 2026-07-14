export class RGBA {
  constructor(
    public readonly r: number,
    public readonly g: number,
    public readonly b: number,
    public readonly a: number = 1,
  ) {}
}

export class Color {
  static readonly transparent = new Color(new RGBA(0, 0, 0, 0));

  constructor(public readonly rgba: RGBA) {}

  isTransparent(): boolean {
    return this.rgba.a === 0;
  }

  toString(): string {
    const { r, g, b, a } = this.rgba;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
}

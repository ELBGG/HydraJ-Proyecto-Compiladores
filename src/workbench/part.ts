import './media/part.css';
import { Disposable } from '../base/common/lifecycle.js';
import { $, append, Dimension } from '../base/browser/dom.js';

export abstract class Part extends Disposable {
  protected _parent: HTMLElement | null = null;
  protected _titleArea: HTMLElement | null = null;
  protected _contentArea: HTMLElement | null = null;
  protected _element: HTMLElement;
  protected _dimension: Dimension = Dimension.None;

  constructor(
    readonly id: string,
    private readonly _options: { hasTitle?: boolean; minimumWidth?: number; minimumHeight?: number },
  ) {
    super();
    this._element = $('div', ['part', `${id}-part`]);
    this._element.id = id;
  }

  get element(): HTMLElement {
    return this._element;
  }

  get minimumWidth(): number {
    return this._options.minimumWidth ?? 0;
  }

  get minimumHeight(): number {
    return this._options.minimumHeight ?? 0;
  }

  create(parent: HTMLElement): void {
    this._parent = parent;
    append(parent, this._element);

    if (this._options.hasTitle) {
      this._titleArea = this.createTitleArea(this._element);
    }
    this._contentArea = this.createContentArea(this._element);
  }

  protected createTitleArea(parent: HTMLElement): HTMLElement {
    const titleArea = $('div', ['title']);
    append(parent, titleArea);
    return titleArea;
  }

  protected abstract createContentArea(parent: HTMLElement): HTMLElement;

  layout(width: number, height: number): void {
    this._dimension = new Dimension(width, height);
    if (this._element) {
      this._element.style.width = `${width}px`;
      this._element.style.height = `${height}px`;
    }
  }
}

import './layout.css';
import { Disposable, DisposableStore } from '../base/common/lifecycle.js';
import { Emitter } from '../base/common/event.js';
import { $, addDisposableListener, getClientArea } from '../base/browser/dom.js';
import { Part } from './part.js';

export type PartLocation = 'titlebar' | 'activitybar' | 'sidebar' | 'editor' | 'panel' | 'statusbar';

export class Layout extends Disposable {
  private _element: HTMLElement;
  private _parts = new Map<PartLocation, Part>();
  private _titleBarContainer: HTMLElement;
  private _bodyContainer: HTMLElement;
  private _mainContainer: HTMLElement;
  private _panelContainer: HTMLElement;
  private _statusBarContainer: HTMLElement;
  private _resizeListeners = new DisposableStore();
  private _sidebarVisible = true;

  private readonly _onDidChange = this._register(new Emitter<void>());
  readonly onDidChange = this._onDidChange.event;

  constructor(parent: HTMLElement) {
    super();

    this._element = $('div', ['hydra-workbench']);
    parent.appendChild(this._element);

    this._titleBarContainer  = $('div', ['part', 'titlebar-container']);
    this._bodyContainer      = $('div', ['body-container']);
    this._mainContainer      = $('div', ['main-container']);
    this._panelContainer     = $('div', ['part', 'panel-container']);
    this._statusBarContainer = $('div', ['part', 'statusbar-container']);

    this._element.appendChild(this._titleBarContainer);
    this._element.appendChild(this._bodyContainer);
    this._element.appendChild(this._statusBarContainer);

    this._bodyContainer.appendChild(this._mainContainer);
    this._bodyContainer.appendChild(this._panelContainer);

    this._register(
      addDisposableListener(window, 'resize', () => this._layoutParts()),
    );
  }

  get element(): HTMLElement { return this._element; }

  registerPart(location: PartLocation, part: Part): void {
    this._parts.set(location, part);
    switch (location) {
      case 'titlebar':   part.create(this._titleBarContainer); break;
      case 'activitybar':
      case 'sidebar':
      case 'editor':     part.create(this._mainContainer);    break;
      case 'panel':      part.create(this._panelContainer);   break;
      case 'statusbar':  part.create(this._statusBarContainer); break;
    }
  }

  setSidebarVisible(visible: boolean): void {
    this._sidebarVisible = visible;
    const sidebar = this._parts.get('sidebar');
    if (sidebar) sidebar.element.style.display = visible ? '' : 'none';
    this._layoutParts();
  }

  private _layoutParts(): void {
    const rootSize = getClientArea(this._element);
    if (rootSize.width <= 0 || rootSize.height <= 0) return;

    const titlebar    = this._parts.get('titlebar');
    const statusbar   = this._parts.get('statusbar');
    const panel       = this._parts.get('panel');
    const activitybar = this._parts.get('activitybar');
    const sidebar     = this._parts.get('sidebar');
    const editor      = this._parts.get('editor');

    const titlebarHeight  = titlebar ? 35 : 0;
    const statusbarHeight = statusbar ? 22 : 0;
    const bodyHeight      = rootSize.height - titlebarHeight - statusbarHeight;

    const activitybarWidth = activitybar ? 48 : 0;
    const sidebarWidth     = sidebar && this._sidebarVisible
      ? Math.max(170, rootSize.width * 0.2)
      : 0;
    const editorWidth = rootSize.width - activitybarWidth - sidebarWidth;

    if (titlebar)    titlebar.layout(rootSize.width, titlebarHeight);
    if (activitybar) activitybar.layout(activitybarWidth, bodyHeight);
    if (sidebar)     sidebar.layout(sidebarWidth, bodyHeight);
    if (editor)      editor.layout(editorWidth, bodyHeight);
    if (panel)       panel.layout(rootSize.width, 0);
    if (statusbar)   statusbar.layout(rootSize.width, statusbarHeight);
  }

  layout(): void { this._layoutParts(); }
}

import './layout.css';
import { Disposable, DisposableStore } from '../base/common/lifecycle.js';
import { Emitter } from '../base/common/event.js';
import { $, addDisposableListener, getClientArea } from '../base/browser/dom.js';
import { Part } from './part.js';

export type PartLocation = 'titlebar' | 'activitybar' | 'sidebar' | 'editor' | 'panel' | 'statusbar';

/** Sane floor for the main row (activitybar/sidebar/editor) height, in pixels. */
const MIN_MAIN_HEIGHT = 100;
/** Sane floor for the editor's own width, so dragging the sidebar wider can never squeeze it away entirely. */
const MIN_EDITOR_WIDTH = 200;

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
  private _panelVisible = false;
  private _panelHeight = 180;
  private _resizeHandle: HTMLElement | null = null;
  private _sidebarWidth: number | null = null; // null until first layout picks a sane initial value
  private _sidebarResizeHandle: HTMLElement | null = null;

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

    // Resize handle between main and panel
    this._resizeHandle = $('div', ['panel-resize-handle']);
    this._bodyContainer.insertBefore(this._resizeHandle, this._panelContainer);
    this._setupResizeHandle();

    this._register(this._resizeListeners);
    this._register(
      addDisposableListener(window, 'resize', () => this._layoutParts()),
    );
  }

  get element(): HTMLElement { return this._element; }

  registerPart(location: PartLocation, part: Part): void {
    this._parts.set(location, part);
    switch (location) {
      case 'titlebar':    part.create(this._titleBarContainer); break;
      case 'activitybar': part.create(this._mainContainer); break;
      case 'sidebar':     part.create(this._mainContainer); break;
      case 'editor':
        // Insert the sidebar↔editor resize handle now, between the already-appended
        // sidebar and the about-to-be-appended editor — 'sidebar' is always registered
        // before 'editor' (see workbench.ts), so DOM order comes out right.
        if (!this._sidebarResizeHandle) {
          this._sidebarResizeHandle = $('div', ['sidebar-resize-handle']);
          this._mainContainer.appendChild(this._sidebarResizeHandle);
          this._setupSidebarResizeHandle();
        }
        part.create(this._mainContainer);
        break;
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

  isSidebarVisible(): boolean { return this._sidebarVisible; }

  toggleSidebar(): void {
    this.setSidebarVisible(!this._sidebarVisible);
  }

  isPanelVisible(): boolean { return this._panelVisible; }

  showPanel(): void {
    this._panelVisible = true;
    // Explicit 'block', not '' — clearing the inline style would just reveal
    // .panel-resize-handle's CSS default of `display: none` again, leaving the
    // handle permanently invisible (and thus undraggable) despite _panelVisible
    // correctly flipping to true.
    if (this._resizeHandle) this._resizeHandle.style.display = 'block';
    this._layoutParts();
  }

  hidePanel(): void {
    this._panelVisible = false;
    if (this._resizeHandle) this._resizeHandle.style.display = 'none';
    this._layoutParts();
  }

  togglePanel(): void {
    if (this._panelVisible) this.hidePanel();
    else this.showPanel();
  }

  private _setupResizeHandle(): void {
    if (!this._resizeHandle) return;
    let dragging = false;
    let startY = 0;
    let startHeight = 0;

    this._resizeListeners.add(addDisposableListener(this._resizeHandle, 'mousedown', (e) => {
      dragging = true;
      startY = e.clientY;
      startHeight = this._panelHeight;
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    }));

    this._resizeListeners.add(addDisposableListener(document, 'mousemove', (e) => {
      if (!dragging) return;
      const delta = startY - e.clientY;

      const rootSize        = getClientArea(this._element);
      const titlebar        = this._parts.get('titlebar');
      const statusbar       = this._parts.get('statusbar');
      const panel           = this._parts.get('panel');
      const titlebarHeight  = titlebar ? titlebar.minimumHeight : 0;
      const statusbarHeight = statusbar ? statusbar.minimumHeight : 0;
      const bodyHeight      = rootSize.height - titlebarHeight - statusbarHeight;
      const minPanelHeight  = panel ? panel.minimumHeight : 0;
      // Never let the panel grow so tall that the main row (activitybar/
      // sidebar/editor) would be squeezed below a usable height.
      const maxPanelHeight  = Math.max(minPanelHeight, bodyHeight - MIN_MAIN_HEIGHT);

      this._panelHeight = Math.max(minPanelHeight, Math.min(600, maxPanelHeight, startHeight + delta));
      this._layoutParts();
    }));

    this._resizeListeners.add(addDisposableListener(document, 'mouseup', () => {
      if (!dragging) return;
      dragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }));
  }

  private _setupSidebarResizeHandle(): void {
    if (!this._sidebarResizeHandle) return;
    let dragging = false;
    let startX = 0;
    let startWidth = 0;

    this._resizeListeners.add(addDisposableListener(this._sidebarResizeHandle, 'mousedown', (e) => {
      dragging = true;
      startX = e.clientX;
      startWidth = this._currentSidebarWidth();
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }));

    this._resizeListeners.add(addDisposableListener(document, 'mousemove', (e) => {
      if (!dragging) return;
      const delta = e.clientX - startX; // dragging right (positive delta) widens the sidebar

      const rootSize         = getClientArea(this._element);
      const activitybar      = this._parts.get('activitybar');
      const sidebar           = this._parts.get('sidebar');
      const activitybarWidth = activitybar ? activitybar.minimumWidth : 0;
      const minSidebarWidth  = sidebar ? sidebar.minimumWidth : 0;
      // Never let the sidebar grow so wide that the editor would be squeezed
      // below a usable width.
      const maxSidebarWidth  = Math.max(minSidebarWidth, rootSize.width - activitybarWidth - MIN_EDITOR_WIDTH);

      this._sidebarWidth = Math.max(minSidebarWidth, Math.min(maxSidebarWidth, startWidth + delta));
      this._layoutParts();
    }));

    this._resizeListeners.add(addDisposableListener(document, 'mouseup', () => {
      if (!dragging) return;
      dragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }));
  }

  /** Effective sidebar width: the user-dragged value once set, otherwise the original
   *  20%-of-window default — used both by layout and as the drag start reference. */
  private _currentSidebarWidth(): number {
    if (this._sidebarWidth !== null) return this._sidebarWidth;
    const rootSize = getClientArea(this._element);
    const sidebar = this._parts.get('sidebar');
    const minWidth = sidebar ? sidebar.minimumWidth : 0;
    return Math.max(minWidth, rootSize.width * 0.2);
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

    const titlebarHeight  = titlebar ? titlebar.minimumHeight : 0;
    const statusbarHeight = statusbar ? statusbar.minimumHeight : 0;
    const bodyHeight      = rootSize.height - titlebarHeight - statusbarHeight;

    const panelHeight = this._panelVisible ? this._panelHeight : 0;
    // Defensive floor: even if _panelHeight wasn't clamped tightly enough
    // (e.g. the window was resized rather than the panel dragged), never
    // hand a negative height to the parts that share the main row.
    const mainHeight  = Math.max(0, bodyHeight - panelHeight);

    const activitybarWidth = activitybar ? activitybar.minimumWidth : 0;
    const minSidebarWidth  = sidebar ? sidebar.minimumWidth : 0;
    const maxSidebarWidth  = Math.max(minSidebarWidth, rootSize.width - activitybarWidth - MIN_EDITOR_WIDTH);
    const sidebarWidth     = sidebar && this._sidebarVisible
      ? Math.max(minSidebarWidth, Math.min(maxSidebarWidth, this._currentSidebarWidth()))
      : 0;
    const editorWidth = rootSize.width - activitybarWidth - sidebarWidth;

    if (this._sidebarResizeHandle) {
      this._sidebarResizeHandle.style.display = this._sidebarVisible ? '' : 'none';
    }

    if (titlebar)    titlebar.layout(rootSize.width, titlebarHeight);
    if (activitybar) activitybar.layout(activitybarWidth, mainHeight);
    if (sidebar)     sidebar.layout(sidebarWidth, mainHeight);
    if (editor)      editor.layout(editorWidth, mainHeight);
    if (panel) {
      panel.layout(rootSize.width, panelHeight);
      this._panelContainer.style.display = this._panelVisible ? 'flex' : 'none';
    }
    if (statusbar)   statusbar.layout(rootSize.width, statusbarHeight);
  }

  layout(): void { this._layoutParts(); }
}

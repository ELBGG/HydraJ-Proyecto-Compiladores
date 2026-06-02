import './media/style.css';
import { Layout, PartLocation } from './layout.js';
import { Part } from './part.js';
import { TitlebarPart } from './parts/titlebar/titlebarPart.js';
import { ActivitybarPart } from './parts/activitybar/activitybarPart.js';
import { SidebarPart } from './parts/sidebar/sidebarPart.js';
import { EditorPart } from './parts/editor/editorPart.js';
import { PanelPart } from './parts/panel/panelPart.js';
import { StatusbarPart } from './parts/statusbar/statusbarPart.js';
import { applyTheme, vsCodeDark } from './themes/theme.js';
import { Emitter } from '../base/common/event.js';
import { Disposable } from '../base/common/lifecycle.js';

export class Workbench extends Disposable {
  private _layout: Layout;
  private _parts = new Map<string, Part>();
  private _editor: EditorPart;
  private _statusbar: StatusbarPart;

  private readonly _onDidLayout = this._register(new Emitter<void>());
  readonly onDidLayout = this._onDidLayout.event;

  constructor(parent: HTMLElement) {
    super();

    applyTheme(vsCodeDark);

    this._layout = new Layout(parent);

    const titlebar = new TitlebarPart();
    const activitybar = new ActivitybarPart();
    const sidebar = new SidebarPart();
    this._editor = new EditorPart();
    const panel = new PanelPart();
    this._statusbar = new StatusbarPart();

    this._registerParts([
      ['titlebar', titlebar],
      ['activitybar', activitybar],
      ['sidebar', sidebar],
      ['editor', this._editor],
      ['panel', panel],
      ['statusbar', this._statusbar],
    ]);

    // Connect statusbar ↔ editor language sync
    this._statusbar.onLanguageChange(({ progLang, humanLang }) => {
      this._editor.setLanguage(progLang, humanLang);
    });

    // Listen for transpile events for status bar feedback
    window.addEventListener('hydracode-transpile', ((e: CustomEvent) => {
      const { success, mapping } = e.detail;
      this._statusbar.setTranspileStatus(
        success ? `\u2705 ${mapping}` : `\u274C ${mapping}`,
      );
    }) as EventListener);

    this._layout.layout();
  }

  private _registerParts(parts: [PartLocation, Part][]): void {
    for (const [location, part] of parts) {
      this._parts.set(location, part);
      this._layout.registerPart(location, part);
      this._register(part);
    }
  }

  layout(): void {
    this._layout.layout();
    this._onDidLayout.fire();
  }
}

import './titlebarPart.css';
import { Part } from '../../part.js';
import { $, append } from '../../../base/browser/dom.js';

export class TitlebarPart extends Part {
  constructor() {
    super('titlebar', { hasTitle: false, minimumHeight: 35 });
  }

  protected createContentArea(parent: HTMLElement): HTMLElement {
    const container = $('div', ['titlebar-content']);
    append(parent, container);

    // Menu area (File, Edit, Selection, View, etc.)
    const menu = $('div', ['titlebar-menu']);
    const menuItems = ['File', 'Edit', 'Selection', 'View', 'Go', 'Run', 'Terminal', 'Help'];
    for (const item of menuItems) {
      const span = document.createElement('span');
      span.textContent = item;
      append(menu, span);
    }
    append(container, menu);

    // Center label
    const center = $('div', ['titlebar-center']);
    center.textContent = 'HydraCode';
    append(container, center);

    // Actions area (minimize, maximize, close for web)
    const actions = $('div', ['titlebar-actions']);
    append(container, actions);

    return container;
  }

  layout(width: number, height: number): void {
    super.layout(width, height);
    const el = this.element;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    el.style.display = 'flex';
    el.style.flexDirection = 'row';
    el.style.alignItems = 'center';
  }
}

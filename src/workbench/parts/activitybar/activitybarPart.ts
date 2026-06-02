import './activitybarPart.css';
import { Part } from '../../part.js';
import { $, append } from '../../../base/browser/dom.js';

interface ActivityBarItem {
  id: string;
  icon: string;
  label: string;
  badge?: string;
}

export class ActivitybarPart extends Part {
  private _activeId = 'explorer';
  private _items: ActivityBarItem[] = [
    { id: 'explorer', icon: '\u{1F4C1}', label: 'Explorer' },
    { id: 'search', icon: '\u{1F50D}', label: 'Search' },
    { id: 'source-control', icon: '\u{1F500}', label: 'Source Control' },
    { id: 'debug', icon: '\u25B6', label: 'Run and Debug' },
    { id: 'extensions', icon: '\u25A1', label: 'Extensions' },
  ];

  private _bottomItems: ActivityBarItem[] = [
    { id: 'accounts', icon: '\u{1F464}', label: 'Accounts' },
    { id: 'settings', icon: '\u2699', label: 'Settings' },
  ];

  private _iconElements = new Map<string, HTMLElement>();

  constructor() {
    super('activitybar', { hasTitle: false, minimumWidth: 48 });
  }

  protected createContentArea(parent: HTMLElement): HTMLElement {
    const container = $('div', ['activitybar-content']);
    append(parent, container);

    const top = $('div', ['activitybar-top']);
    for (const item of this._items) {
      const el = this._createIcon(item);
      append(top, el);
    }
    append(container, top);

    const bottom = $('div', ['activitybar-bottom']);
    for (const item of this._bottomItems) {
      const el = this._createIcon(item);
      append(bottom, el);
    }
    append(container, bottom);

    return container;
  }

  private _createIcon(item: ActivityBarItem): HTMLElement {
    const el = $('div', ['activitybar-icon']);
    if (item.id === this._activeId) {
      el.classList.add('active');
    }
    el.title = item.label;
    el.textContent = item.icon;
    el.dataset.id = item.id;

    if (item.badge) {
      const badge = $('div', ['badge']);
      badge.textContent = item.badge;
      append(el, badge);
    }

    el.addEventListener('click', () => this._onIconClick(item.id));
    this._iconElements.set(item.id, el);
    return el;
  }

  private _onIconClick(id: string): void {
    this._iconElements.forEach((el, key) => {
      el.classList.toggle('active', key === id);
    });
    this._activeId = id;
  }

  layout(width: number, height: number): void {
    super.layout(width, height);
    this.element.style.width = `${width}px`;
    this.element.style.height = `${height}px`;
    this._element.style.display = 'flex';
    this._element.style.flexDirection = 'column';
  }
}

import './activitybarPart.css';
import { Part } from '../../part.js';
import { $, append } from '../../../base/browser/dom.js';
import { Emitter } from '../../../base/common/event.js';
import {
  iconExplorer, iconSearch, iconBlocks, iconMic,
  iconBranch, iconPlay, iconExtensions, iconPerson, iconGear,
  createIconElement,
} from '../../../base/browser/icons.js';

interface ActivityBarItem {
  id: string;
  icon: string;
  label: string;
}

export class ActivitybarPart extends Part {
  private _activeId: string | null = 'explorer';
  private _items: ActivityBarItem[] = [
    { id: 'explorer',       icon: 'explorer',       label: 'Explorer' },
    { id: 'search',         icon: 'search',         label: 'Search' },
    { id: 'blocks',         icon: 'blocks',         label: 'Bloques de Código' },
    { id: 'stt',            icon: 'mic',            label: 'Speech to Text' },
    { id: 'source-control', icon: 'branch',         label: 'Source Control' },
    { id: 'debug',          icon: 'play',           label: 'Run and Debug' },
    { id: 'extensions',     icon: 'extensions',     label: 'Extensions' },
  ];

  private _bottomItems: ActivityBarItem[] = [
    { id: 'accounts', icon: 'person', label: 'Accounts' },
    { id: 'settings', icon: 'gear',   label: 'Settings' },
  ];

  private _iconElements = new Map<string, HTMLElement>();

  private readonly _onIconActivate = this._register(new Emitter<string>());
  readonly onIconActivate = this._onIconActivate.event;

  constructor() {
    super('activitybar', { hasTitle: false, minimumWidth: 48 });
  }

  protected createContentArea(parent: HTMLElement): HTMLElement {
    const container = $('div', ['activitybar-content']);
    append(parent, container);

    const top = $('div', ['activitybar-top']);
    for (const item of this._items) append(top, this._createIcon(item));
    append(container, top);

    const bottom = $('div', ['activitybar-bottom']);
    for (const item of this._bottomItems) append(bottom, this._createIcon(item));
    append(container, bottom);

    return container;
  }

  private _iconFns: Record<string, () => string> = {
    explorer: iconExplorer, search: iconSearch, blocks: iconBlocks, mic: iconMic,
    branch: iconBranch, play: iconPlay, extensions: iconExtensions,
    person: iconPerson, gear: iconGear,
  };

  private _createIcon(item: ActivityBarItem): HTMLElement {
    const el = $('div', ['activitybar-icon']);
    if (item.id === this._activeId) el.classList.add('active');
    el.title = item.label;
    const iconEl = createIconElement(this._iconFns[item.icon]?.() ?? '');
    append(el, iconEl);
    el.dataset.id = item.id;
    el.addEventListener('click', () => this._onIconClick(item.id));
    this._iconElements.set(item.id, el);
    return el;
  }

  private _onIconClick(id: string): void {
    this._iconElements.forEach((el, key) => el.classList.toggle('active', key === id));
    this._activeId = id;
    this._onIconActivate.fire(id);
  }

  layout(width: number, height: number): void {
    super.layout(width, height);
    this.element.style.width = `${width}px`;
    this.element.style.height = `${height}px`;
    this._element.style.display = 'flex';
    this._element.style.flexDirection = 'column';
  }
}

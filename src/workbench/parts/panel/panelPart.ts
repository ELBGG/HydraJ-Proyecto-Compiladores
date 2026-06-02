import './panelPart.css';
import { Part } from '../../part.js';
import { $, append } from '../../../base/browser/dom.js';

interface PanelTab {
  id: string;
  label: string;
  content: string;
}

export class PanelPart extends Part {
  private _activeTabId = 'terminal';
  private _tabElements = new Map<string, HTMLElement>();

  private _tabs: PanelTab[] = [
    { id: 'terminal', label: 'TERMINAL', content: '> HydraCode Terminal ready\n> _' },
    { id: 'problems', label: 'PROBLEMS', content: 'No problems detected.' },
    { id: 'output', label: 'OUTPUT', content: '' },
    { id: 'debug-console', label: 'DEBUG CONSOLE', content: 'Debug console ready.' },
  ];

  private _bodyEl: HTMLElement | null = null;

  constructor() {
    super('panel', { hasTitle: false, minimumHeight: 100 });
  }

  protected createContentArea(parent: HTMLElement): HTMLElement {
    const container = $('div', ['panel-content']);
    append(parent, container);

    const tabsContainer = $('div', ['panel-tabs']);
    for (const tab of this._tabs) {
      const tabEl = $('div', ['panel-tab']);
      tabEl.textContent = tab.label;
      if (tab.id === this._activeTabId) {
        tabEl.classList.add('active');
      }
      tabEl.addEventListener('click', () => this._activateTab(tab.id));
      this._tabElements.set(tab.id, tabEl);
      append(tabsContainer, tabEl);
    }
    append(container, tabsContainer);

    this._bodyEl = $('div', ['panel-body']);
    this._updateBody();
    append(container, this._bodyEl);

    return container;
  }

  private _activateTab(id: string): void {
    this._activeTabId = id;
    this._tabElements.forEach((el, key) => {
      el.classList.toggle('active', key === id);
    });
    this._updateBody();
  }

  private _updateBody(): void {
    if (!this._bodyEl) return;
    const tab = this._tabs.find(t => t.id === this._activeTabId);
    this._bodyEl.textContent = tab?.content ?? '';
  }

  layout(width: number, height: number): void {
    super.layout(width, height);
    this._element.style.width = `${width}px`;
    this._element.style.height = `${height}px`;
    this._element.style.display = 'flex';
    this._element.style.flexDirection = 'column';
  }
}

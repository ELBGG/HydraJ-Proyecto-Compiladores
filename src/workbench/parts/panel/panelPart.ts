import './panelPart.css';
import { Part } from '../../part.js';
import { $, append } from '../../../base/browser/dom.js';
import { TerminalPanel } from './terminalPanel.js';

interface PanelTab {
  id: string;
  label: string;
  content: string;
}

export class PanelPart extends Part {
  private _activeTabId = 'terminal';
  private _tabElements = new Map<string, HTMLElement>();
  private _bodyEl: HTMLElement | null = null;
  private _outputEl: HTMLElement | null = null;
  private _terminalWrapper: HTMLElement | null = null;
  private _terminalPanel: TerminalPanel | null = null;

  private _tabs: PanelTab[] = [
    { id: 'terminal',      label: 'TERMINAL',      content: '' },
    { id: 'problems',      label: 'PROBLEMS',      content: 'No se detectaron problemas.' },
    { id: 'output',        label: 'OUTPUT',        content: '' },
    { id: 'debug-console', label: 'DEBUG CONSOLE', content: 'Debug console listo.' },
  ];

  constructor() {
    super('panel', { hasTitle: false, minimumHeight: 100 });
  }

  activateTab(id: string): void {
    this._activateTab(id);
  }

  clearOutput(): void {
    const tab = this._tabs.find(t => t.id === 'output');
    if (tab) tab.content = '';
    if (this._outputEl) this._outputEl.innerHTML = '';
  }

  appendOutput(text: string, type: 'stdout' | 'stderr' | 'info' = 'stdout'): void {
    const tab = this._tabs.find(t => t.id === 'output');
    if (tab) tab.content += text;

    if (this._activeTabId === 'output' && this._outputEl) {
      this._appendOutputLine(text, type);
    }
  }

  private _appendOutputLine(text: string, type: string): void {
    if (!this._outputEl) return;
    const span = document.createElement('span');
    span.className = `output-line output-${type}`;
    span.textContent = text;
    this._outputEl.appendChild(span);
    this._outputEl.scrollTop = this._outputEl.scrollHeight;
  }

  protected createContentArea(parent: HTMLElement): HTMLElement {
    const container = $('div', ['panel-content']);
    append(parent, container);

    const tabsContainer = $('div', ['panel-tabs']);
    for (const tab of this._tabs) {
      const tabEl = $('div', ['panel-tab']);
      tabEl.textContent = tab.label;
      if (tab.id === this._activeTabId) tabEl.classList.add('active');
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
    this._tabElements.forEach((el, key) => el.classList.toggle('active', key === id));
    this._updateBody();
  }

  private _updateBody(): void {
    if (!this._bodyEl) return;

    // Detach terminal wrapper before clearing innerHTML (xterm DOM must be preserved)
    if (this._terminalWrapper?.parentElement) {
      this._bodyEl.removeChild(this._terminalWrapper);
    }

    this._bodyEl.innerHTML = '';
    this._bodyEl.classList.remove('terminal-active');
    this._outputEl = null;

    const tab = this._tabs.find(t => t.id === this._activeTabId);
    if (!tab) return;

    if (tab.id === 'terminal') {
      if (!this._terminalWrapper) {
        this._terminalWrapper = document.createElement('div');
        this._terminalWrapper.className = 'terminal-wrapper';
        this._terminalPanel = new TerminalPanel(this._terminalWrapper);
      }
      this._bodyEl.classList.add('terminal-active');
      this._bodyEl.appendChild(this._terminalWrapper);
      requestAnimationFrame(() => {
        this._terminalPanel?.fit();
        this._terminalPanel?.focus();
      });
      return;
    }

    if (tab.id === 'output') {
      this._outputEl = $('div', ['output-container']);
      if (tab.content) {
        const lines = tab.content.split('\n');
        for (const line of lines) {
          const span = document.createElement('span');
          span.className = 'output-line output-stdout';
          span.textContent = line + (line === lines[lines.length - 1] ? '' : '\n');
          this._outputEl.appendChild(span);
        }
      }
      append(this._bodyEl, this._outputEl);
    } else {
      this._bodyEl.textContent = tab.content;
    }
  }

  layout(width: number, height: number): void {
    super.layout(width, height);
    this._element.style.width = `${width}px`;
    this._element.style.height = `${height}px`;
    this._element.style.display = 'flex';
    this._element.style.flexDirection = 'column';
    if (this._activeTabId === 'terminal') {
      requestAnimationFrame(() => this._terminalPanel?.fit());
    }
  }

  dispose(): void {
    this._terminalPanel?.dispose();
    this._terminalPanel = null;
    super.dispose();
  }
}

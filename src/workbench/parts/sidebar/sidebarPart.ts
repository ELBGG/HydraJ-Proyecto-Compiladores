import './sidebarPart.css';
import { Part } from '../../part.js';
import { $, append } from '../../../base/browser/dom.js';

interface TreeItem {
  label: string;
  icon?: string;
  children?: TreeItem[];
}

export class SidebarPart extends Part {
  private _activeSection = 'workspace';

  private _sections = new Map<string, { label: string; items: TreeItem[] }>();

  constructor() {
    super('sidebar', { hasTitle: false, minimumWidth: 200 });

    this._sections.set('workspace', {
      label: 'WORKSPACE',
      items: [
        { label: 'src', icon: '\u{1F4C1}' },
        { label: 'index.html', icon: '\u{1F4C4}' },
        { label: 'package.json', icon: '\u{1F4C4}' },
        { label: 'tsconfig.json', icon: '\u{1F4C4}' },
        { label: 'vite.config.ts', icon: '\u{1F4C4}' },
      ],
    });
    this._sections.set('outline', {
      label: 'OUTLINE',
      items: [
        { label: 'No outline available' },
      ],
    });
    this._sections.set('timeline', {
      label: 'TIMELINE',
      items: [
        { label: 'No timeline entries' },
      ],
    });
  }

  protected createContentArea(parent: HTMLElement): HTMLElement {
    const container = $('div', ['sidebar-content']);
    append(parent, container);

    for (const [, section] of this._sections) {
      const sectionEl = this._createSection(section);
      append(container, sectionEl);
    }

    return container;
  }

  private _createSection(section: { label: string; items: TreeItem[] }): HTMLElement {
    const sectionEl = $('div', ['sidebar-section']);

    const header = $('div', ['sidebar-section-header']);
    header.textContent = section.label;
    append(sectionEl, header);

    for (const item of section.items) {
      const itemEl = $('div', ['sidebar-item']);
      if (item.icon) {
        const iconSpan = document.createElement('span');
        iconSpan.textContent = `${item.icon} `;
        iconSpan.style.marginRight = '4px';
        append(itemEl, iconSpan);
      }
      const labelSpan = document.createElement('span');
      labelSpan.textContent = item.label;
      append(itemEl, labelSpan);

      itemEl.addEventListener('click', () => {
        sectionEl.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
        itemEl.classList.add('active');
      });

      append(sectionEl, itemEl);
    }

    return sectionEl;
  }

  layout(width: number, height: number): void {
    super.layout(width, height);
    this._element.style.width = `${width}px`;
    this._element.style.height = `${height}px`;
    this._element.style.display = 'flex';
    this._element.style.flexDirection = 'column';
  }
}

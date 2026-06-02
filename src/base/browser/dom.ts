export function $<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  classes?: string[],
  children?: (HTMLElement | string)[],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (classes) {
    el.className = classes.join(' ');
  }
  if (children) {
    for (const child of children) {
      if (typeof child === 'string') {
        el.appendChild(document.createTextNode(child));
      } else {
        el.appendChild(child);
      }
    }
  }
  return el;
}

export function append<T extends HTMLElement>(parent: HTMLElement, child: T): T {
  parent.appendChild(child);
  return child;
}

export function prepend<T extends HTMLElement>(parent: HTMLElement, child: T): T {
  parent.prepend(child);
  return child;
}

export function clearNode(node: HTMLElement): void {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

export function getWindow(element: HTMLElement): Window {
  return element.ownerDocument.defaultView || window;
}

export function addDisposableListener<K extends keyof HTMLElementEventMap>(
  node: HTMLElement | Window,
  type: K,
  handler: (event: HTMLElementEventMap[K]) => void,
): { dispose: () => void } {
  node.addEventListener(type, handler as EventListener);
  return {
    dispose: () => node.removeEventListener(type, handler as EventListener),
  };
}

export function getClientArea(element: HTMLElement): { width: number; height: number } {
  const rect = element.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}

export function size(element: HTMLElement, width: number, height: number): void {
  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
}

export class Dimension {
  static readonly None = new Dimension(0, 0);

  constructor(
    public readonly width: number,
    public readonly height: number,
  ) {}
}

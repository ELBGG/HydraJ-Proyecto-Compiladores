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

export function append<T extends Node>(parent: HTMLElement, child: T): T;
export function append<T extends Node>(parent: HTMLElement, ...children: (T | string)[]): void;
export function append<T extends Node>(parent: HTMLElement, ...children: (T | string)[]): T | void {
  parent.append(...children);
  if (children.length === 1 && typeof children[0] !== 'string') {
    return children[0];
  }
}

const SELECTOR_REGEX = /([\w-]+)?(#([\w-]+))?((\.([\w-]+))*)/;

/** Creates an element from a CSS-selector-like description, e.g. `$css('.monaco-sash.vertical')`. */
export function $css<T extends HTMLElement>(description: string, attrs?: { [key: string]: any }, ...children: Array<Node | string>): T {
  const match = SELECTOR_REGEX.exec(description);
  if (!match) {
    throw new Error('Bad use of emmet');
  }

  const tagName = match[1] || 'div';
  const result = document.createElement(tagName) as unknown as T;

  if (match[3]) {
    result.id = match[3];
  }
  if (match[4]) {
    result.className = match[4].replace(/\./g, ' ').trim();
  }

  if (attrs) {
    for (const [name, value] of Object.entries(attrs)) {
      if (typeof value === 'undefined') continue;
      if (/^on\w+$/.test(name)) {
        (result as any)[name] = value;
      } else {
        result.setAttribute(name, value);
      }
    }
  }

  result.append(...children);
  return result;
}

export interface EventLike {
  preventDefault(): void;
  stopPropagation(): void;
}

export const EventHelper = {
  stop: <T extends EventLike>(e: T, cancelBubble?: boolean): T => {
    e.preventDefault();
    if (cancelBubble) {
      e.stopPropagation();
    }
    return e;
  },
};

export function isHTMLElement(e: unknown): e is HTMLElement {
  return e instanceof HTMLElement;
}

export function reset(parent: HTMLElement, ...children: Array<Node | string>): void {
  parent.textContent = '';
  parent.append(...children);
}

export function show(...elements: HTMLElement[]): void {
  for (const element of elements) {
    element.style.display = '';
    element.removeAttribute('aria-hidden');
  }
}

export function hide(...elements: HTMLElement[]): void {
  for (const element of elements) {
    element.style.display = 'none';
    element.setAttribute('aria-hidden', 'true');
  }
}

export function setVisibility(visible: boolean, ...elements: HTMLElement[]): void {
  if (visible) {
    show(...elements);
  } else {
    hide(...elements);
  }
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

export function scheduleAtNextAnimationFrame(targetWindow: Window, runner: () => void, _priority = 0): { dispose: () => void } {
  const handle = targetWindow.requestAnimationFrame(runner);
  return { dispose: () => targetWindow.cancelAnimationFrame(handle) };
}

export function addDisposableListener<K extends keyof HTMLElementEventMap>(
  node: HTMLElement | Window,
  type: K,
  handler: (event: HTMLElementEventMap[K]) => void,
): { dispose: () => void };
export function addDisposableListener(
  node: EventTarget,
  type: string,
  handler: (event: any) => void,
  useCaptureOrOptions?: boolean | AddEventListenerOptions,
): { dispose: () => void };
export function addDisposableListener(
  node: EventTarget,
  type: string,
  handler: (event: any) => void,
  useCaptureOrOptions?: boolean | AddEventListenerOptions,
): { dispose: () => void } {
  node.addEventListener(type, handler, useCaptureOrOptions);
  return {
    dispose: () => node.removeEventListener(type, handler, useCaptureOrOptions),
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

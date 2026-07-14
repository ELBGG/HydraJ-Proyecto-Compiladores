export function createStyleSheet(container: HTMLElement = document.head): HTMLStyleElement {
  const style = document.createElement('style');
  style.type = 'text/css';
  style.media = 'screen';
  container.appendChild(style);
  return style;
}

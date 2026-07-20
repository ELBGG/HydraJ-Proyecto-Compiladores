export function svgIcon(path: string, viewBox = '0 0 16 16'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

export function svgIconFilled(path: string, viewBox = '0 0 16 16'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="currentColor">${path}</svg>`;
}

function dataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function bgSvg(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// ── Activity Bar ──

export const iconExplorer = () => svgIcon('<path d="M1.5 3.5L6 1.5l5.5 2L14 5v9l-4.5-1.5L4 14l-2.5-1V3.5Z"/><path d="M6 1.5v12.5M11.5 3.5V14"/>');
export const iconSearch = () => svgIcon('<circle cx="6.5" cy="6.5" r="4.5"/><path d="M10 10l4 4"/>');
export const iconBlocks = () => svgIcon('<rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/>');
export const iconMic = () => svgIcon('<rect x="5.5" y="1.5" width="5" height="8" rx="2.5"/><path d="M2.5 8A5.5 5.5 0 0 0 13.5 8M8 11.5V14"/>');
export const iconBranch = () => svgIcon('<circle cx="3" cy="3" r="1.5"/><circle cx="13" cy="13" r="1.5"/><path d="M3 4.5v7a2 2 0 0 0 2 2h3"/><path d="M4.5 3h5a2 2 0 0 1 2 2v6.5"/>');
export const iconPlay = () => svgIcon('<path d="M3 2l10 6L3 14V2Z"/>');
export const iconExtensions = () => svgIcon('<rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/>');
export const iconMappings = () => svgIcon('<path d="M2.5 5.5h7.5M8 2.5l2.5 3-2.5 3"/><path d="M13.5 10.5H6M8 13.5L5.5 10.5 8 7.5"/>');
export const iconPerson = () => svgIcon('<circle cx="8" cy="5" r="3"/><path d="M2 14.5a6 6 0 0 1 12 0"/>');
export const iconGear = () => svgIcon('<circle cx="8" cy="8" r="2.5"/><path d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2M12.5 3.5l-1.5 1.5M5 11L3.5 12.5M12.5 12.5L11 11M5 5L3.5 3.5"/>');

// ── Status Bar ──

export const iconGlobe = () => svgIcon('<circle cx="8" cy="8" r="6.5"/><path d="M1.5 8h13M8 1.5a10 10 0 0 1 0 13 10 10 0 0 1 0-13Z"/>');
export const iconPencil = () => svgIcon('<path d="M11 1.5l3.5 3.5L5 14.5H1.5V11L11 1.5Z"/>');
export const iconCheck = () => svgIcon('<path d="M2 8l4 4 8-8"/>');
export const iconCross = () => svgIcon('<path d="M3 3l10 10M13 3L3 13"/>');
export const iconError = () => svgIcon('<circle cx="8" cy="8" r="6"/><path d="M8 4.5v4M8 11v.5"/>');

// ── Title Bar ──

export const iconHydraCode = () => svgIcon('<path d="M2 14V2l4 3v9M14 2v12l-4-3V2M8 4v8"/>', '0 0 16 16');

// ── File Icons ──

export const iconFile = () => svgIcon('<path d="M2.5 1.5h7l4 4v9h-11v-13Z"/><path d="M9.5 1.5v4h4"/>');
export const iconFileCode = () => svgIcon('<path d="M2.5 1.5h7l4 4v9h-11v-13Z"/><path d="M9.5 1.5v4h4"/><path d="M5 8l-2 2 2 2M11 8l2 2-2 2M7.5 7l-1 6"/>');
export const iconFolder = () => svgIcon('<path d="M1.5 3.5a2 2 0 0 1 2-2h2.5l2 2h4.5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-9Z"/>');
export const iconFolderOpen = () => svgIcon('<path d="M1.5 4a2 2 0 0 1 2-2h2l2 2H13a2 2 0 0 1 2 2v.5"/><path d="M1.5 5.5l1.5 7a2 2 0 0 0 2 1.5h9a2 2 0 0 0 2-1.5l1.5-7H1.5Z"/>');

// ── STT ──

export const iconRecord = () => svgIconFilled('<circle cx="8" cy="8" r="4"/>');
export const iconStop = () => svgIconFilled('<rect x="4" y="4" width="8" height="8" rx="1"/>');
export const iconDownload = () => svgIcon('<path d="M8 1.5v9M3.5 7L8 11.5 12.5 7"/><path d="M1.5 11.5v2a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-2"/>');
export const iconLoading = () => svgIcon('<circle cx="8" cy="8" r="6"/><path d="M8 2a6 6 0 0 1 6 6" stroke-dasharray="4 3"/>');
export const iconInsert = () => svgIcon('<path d="M8 1.5v10M3.5 7L8 11.5 12.5 7"/><path d="M2 13.5h12"/>');

// ── Editor ──

export const iconClose = () => svgIcon('<path d="M4 4l8 8M12 4l-8 8"/>');
export const iconChevronDown = () => svgIcon('<path d="M3 6l5 5 5-5"/>');
export const iconChevronUp = () => svgIcon('<path d="M13 10L8 5 3 10"/>');
export const iconTranspile = () => svgIcon('<path d="M3 2l10 6L3 14V2Z"/>');
export const iconLightning = () => svgIcon('<path d="M7 1.5L2.5 9h4L5 14.5 13 6.5H8.5L10 1.5H7Z"/>');
export const iconPlus = () => svgIcon('<path d="M8 2.5v11M2.5 8h11"/>');
export const iconMinus = () => svgIcon('<path d="M2.5 8h11"/>');
export const iconUpload = () => svgIcon('<path d="M8 14.5v-9M3.5 9L8 4.5 12.5 9"/><path d="M1.5 14.5h13"/>');
export const iconSync = () => svgIcon('<path d="M13.5 8a5.5 5.5 0 0 0-9.6-3.6M2.5 8a5.5 5.5 0 0 0 9.6 3.6"/><path d="M3.9 4.4H2.5V3M12.1 11.6h1.4V13"/>');
export const iconNewFile = () => svgIcon('<path d="M2.5 1.5h6l3.5 3.5v9h-9.5v-12.5Z"/><path d="M8.5 1.5v3.5h3.5"/><path d="M4.5 10h4M6.5 8v4"/>');
export const iconNewFolder = () => svgIcon('<path d="M1.5 3.5a2 2 0 0 1 2-2h2.5l2 2h4.5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-9Z"/><path d="M8 7v4M6 9h4"/>');
export const iconRefresh = () => svgIcon('<path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9"/><path d="M13.5 2v3.5H10"/>');
export const iconCollapseAll = () => svgIcon('<path d="M4 6.5L8 3l4 3.5M4 12.5L8 9l4 3.5"/>');
export const iconTrash = () => svgIcon('<path d="M2.5 4.5h11M6 4.5v-2h4v2M4.5 4.5v9a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-9"/>');

// ── Helper to create an SVG element ──

export function createSvgElement(svgString: string): SVGSVGElement {
  const div = document.createElement('div');
  div.innerHTML = svgString.trim();
  return div.firstChild as SVGSVGElement;
}

export function createIconElement(svgString: string, className = ''): HTMLElement {
  const el = document.createElement('span');
  el.className = `svg-icon${className ? ' ' + className : ''}`;
  el.innerHTML = svgString;
  return el;
}

export function makeBgIcon(svgString: string): string {
  return bgSvg(svgString);
}

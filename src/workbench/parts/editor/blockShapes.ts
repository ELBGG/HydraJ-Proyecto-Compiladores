const CANVAS_BG = '#1e1e2e';
const NOTCH_W = 28;
const BUMP_W = 28;

export function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, (n >> 16) + amount);
  const g = Math.min(255, ((n >> 8) & 0xff) + amount);
  const b = Math.min(255, (n & 0xff) + amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function darken(hex: string, amount = 50): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, (n >> 16) - amount);
  const g = Math.max(0, ((n >> 8) & 0xff) - amount);
  const b = Math.max(0, (n & 0xff) - amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function blockGradient(color: string, dark: string): string {
  const l1 = lighten(color, 18);
  const l2 = lighten(color, 6);
  return `linear-gradient(180deg, ${l1} 0%, ${l2} 3px, ${color} 8px, ${dark} 100%)`;
}

export function fullBlockSVG(
  color: string, dark: string,
  hasNotch: boolean, hasHat: boolean,
  w: number, h: number,
): string {
  const pad = 1;
  const cr = hasHat ? 16 : 4;
  const nw = NOTCH_W;
  const nh = 10;
  const bw = BUMP_W;
  const bh = 12;
  const totalH = (hasNotch ? nh : 0) + h + bh + pad;

  // notch starts at center minus half-width
  const nx = (w - nw) / 2;
  // bump starts at center minus half-width
  const bx = (w - bw) / 2;

  const topY = hasNotch ? nh : 0;
  const bodyTop = topY;
  const bodyBot = topY + h;
  const bumpTop = bodyBot;
  const bumpBot = bumpTop + bh;

  const light = lighten(color, 18);
  const light2 = lighten(color, 6);

  // Build path: start at (nx, topY) after notch
  let d = '';

  if (hasNotch) {
    // Notch: U-shape cutout at top — path goes around it
    // Start at left edge, go right to notch
    d += `M ${pad},${nh} `;
    d += `L ${nx},${nh} `;
    // Notch concave: arc down and up (counter-clockwise)
    const r = nw / 2;
    d += `A ${r},${nh} 0 0,0 ${nx + nw},${nh} `;
    // Continue to right edge
    d += `L ${w - pad},${nh} `;
  } else if (hasHat) {
    // Hat: large rounded top starting from left
    d += `M ${cr},0 `;
    d += `Q 0,0 0,${cr} `;
    d += `L 0,${bodyBot} `;
  } else {
    // No notch, no hat — simple top edge
    d += `M ${pad},${topY} `;
    d += `L ${w - pad},${topY} `;
  }

  // Right edge (unless hat)
  if (!hasHat) {
    d += `Q ${w},${topY} ${w},${topY + cr} `;
  }
  d += `L ${w},${bodyBot} `;

  // Bottom-right corner (only if there's no bump at bottom-right)
  // Actually bump is centered, so we need to handle the bottom
  if (bx > 0) {
    // Right bottom corner before bump
    d += `L ${w},${bumpTop} `;
    d += `Q ${w},${bumpBot} ${w - pad},${bumpBot} `;
    // Go left to bump right edge
    d += `L ${bx + bw},${bumpBot} `;
  } else {
    d += `L ${w},${bumpBot} `;
  }

  // Bump: convex arc downward
  const br = bw / 2;
  d += `A ${br},${bh * 0.6} 0 0,1 ${bx},${bumpBot} `;

  if (bx > 0) {
    // Go left to left edge
    d += `L ${pad},${bumpBot} `;
    d += `Q 0,${bumpBot} 0,${bumpTop} `;
  }

  // Left edge up
  d += `L 0,${bodyTop + cr} `;
  if (!hasHat) {
    d += `Q 0,${bodyTop} ${pad},${bodyTop} `;
  } else {
    d += `Q 0,${bodyTop} 0,${bodyTop} `;
  }
  d += 'Z';

  const gradId = `bg-${color.slice(1)}-${dark.slice(1)}`;
  // simple hash for unique id
  const uid = gradId.replace(/[#.]/g, '');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w + pad * 2}" height="${totalH + pad}" viewBox="0 0 ${w + pad * 2} ${totalH + pad}" style="display:block;overflow:visible">
    <defs>
      <linearGradient id="g-${uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${light}"/>
        <stop offset="${hasHat ? '6' : '3'}px" stop-color="${light2}"/>
        <stop offset="12px" stop-color="${color}"/>
        <stop offset="100%" stop-color="${dark}"/>
      </linearGradient>
      <filter id="s-${uid}" x="-10%" y="-10%" width="130%" height="130%">
        <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="rgba(0,0,0,0.45)"/>
      </filter>
    </defs>
    <path d="${d}" fill="url(#g-${uid})" stroke="${dark}" stroke-width="0.5" filter="url(#s-${uid})"/>
  </svg>`;
}

export function cBlockHeaderSVG(color: string, dark: string, w: number): string {
  const light = lighten(color, 18);
  const light2 = lighten(color, 6);
  const h = 36;
  const uid = `c-${color.slice(1)}-${Date.now()}`;

  const nw = NOTCH_W;
  const nh = 10;
  const nx = (w - nw) / 2;

  let d = `M 0,${nh} L ${nx},${nh} `;
  const r = nw / 2;
  d += `A ${r},${nh} 0 0,0 ${nx + nw},${nh} `;
  d += `L ${w},${nh} L ${w},${h} L 0,${h} Z`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h + nh}" viewBox="0 0 ${w} ${h + nh}" style="display:block;width:100%;overflow:visible">
    <defs>
      <linearGradient id="g-${uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${light}"/>
        <stop offset="${3}px" stop-color="${light2}"/>
        <stop offset="12px" stop-color="${color}"/>
        <stop offset="100%" stop-color="${dark}"/>
      </linearGradient>
      <filter id="s-${uid}" x="-10%" y="-10%" width="130%" height="130%">
        <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="rgba(0,0,0,0.45)"/>
      </filter>
    </defs>
    <path d="${d}" fill="url(#g-${uid})" stroke="${dark}" stroke-width="0.5" filter="url(#s-${uid})"/>
    <line x1="0" y1="${h}" x2="${w}" y2="${h}" stroke="${dark}" stroke-width="0.5"/>
  </svg>`;
}

export function cBlockElseSVG(color: string, dark: string, w: number): string {
  const light = lighten(color, 8);
  const uid = `e-${color.slice(1)}-${Date.now()}`;
  const h = 28;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;width:100%;overflow:visible">
    <defs>
      <linearGradient id="g-${uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${light}"/>
        <stop offset="30%" stop-color="${color}"/>
        <stop offset="100%" stop-color="${dark}"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${w}" height="${h}" rx="4" ry="4" fill="url(#g-${uid})" stroke="${dark}" stroke-width="0.5"/>
  </svg>`;
}

export function cBlockBottomSVG(color: string, dark: string, w: number): string {
  const light = lighten(color, 18);
  const light2 = lighten(color, 6);
  const uid = `bot-${color.slice(1)}-${Date.now()}`;
  const bw = BUMP_W;
  const bh = 12;
  const bx = (w - bw) / 2;
  const h = 14;

  const br = bw / 2;
  let d = `M 0,0 L ${w},0 L ${w},${h} `;
  d += `L ${bx + bw},${h} `;
  d += `A ${br},${bh * 0.6} 0 0,1 ${bx},${h} `;
  d += `L 0,${h} Z`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h + bh}" viewBox="0 0 ${w} ${h + bh}" style="display:block;width:100%;overflow:visible">
    <defs>
      <linearGradient id="g-${uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${light2}"/>
        <stop offset="30%" stop-color="${color}"/>
        <stop offset="100%" stop-color="${dark}"/>
      </linearGradient>
    </defs>
    <path d="${d}" fill="url(#g-${uid})" stroke="${dark}" stroke-width="0.5"/>
    <line x1="0" y1="0" x2="${w}" y2="0" stroke="${dark}" stroke-width="0.5"/>
  </svg>`;
}

export function createSVGElement(svg: string): HTMLElement {
  const wrapper = document.createElement('span');
  wrapper.style.cssText = 'display:block;width:100%;overflow:visible';
  wrapper.innerHTML = svg.trim();
  return wrapper;
}

export { NOTCH_W, BUMP_W, CANVAS_BG };

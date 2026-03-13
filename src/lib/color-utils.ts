/** Derive a lighter variant (for burst/home center). */
export function deriveBurstColor(hex: string): string {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h, Math.min(1, s * 1.1), Math.min(1, l * 1.15));
}

/** Derive a darker variant (for home spot fill). */
export function deriveSpotColor(hex: string): string {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h, Math.min(1, s * 1.05), Math.max(0, l * 0.75));
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: h * 360, s: l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min), l };
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  const r = Math.round(f(0) * 255);
  const g = Math.round(f(8) * 255);
  const b = Math.round(f(4) * 255);
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Default base palette (18 colors). First 6 are original R/Y/G/B/O/M; 7–17 extend the palette. */
export const DEFAULT_BASE_PALETTE: readonly string[] = [
  '#e7372d', '#fbc62f', '#52b44f', '#0095d3', '#e67e22', '#d33682',
  '#1abc9c', '#e91e63', '#e91e8c', '#a3e048', '#00897b', '#1a237e',
  '#ff7043', '#880e4f', '#6b8e23', '#3949ab', '#ffb300', '#69f0ae',
];

/** Map color name to hex for display. Matches COLORS_PALETTE in game types. */
export function getColorHex(color: string): string {
  const map: Record<string, string> = {
    RED: '#c0392b',
    YELLOW: '#f1c40f',
    GREEN: '#27ae60',
    BLUE: '#2980b9',
    ORANGE: '#e67e22',
    PURPLE: '#8e44ad',
    CYAN: '#1abc9c',
    MAGENTA: '#e91e63',
    PINK: '#e91e8c',
    LIME: '#a3e048',
    TEAL: '#00897b',
    NAVY: '#1a237e',
    CORAL: '#ff7043',
    MAROON: '#880e4f',
    OLIVE: '#6b8e23',
    INDIGO: '#3949ab',
    AMBER: '#ffb300',
    MINT: '#69f0ae',
  };
  return map[color.toUpperCase()] ?? '#95a5a6';
}

/** Subtle background tint from player color (for history entry). */
export function getEntryBgColor(color: string): string {
  const hex = getColorHex(color);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.12)`;
}

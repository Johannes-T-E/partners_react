/**
 * Color themes for player colors. Built-in "Classic" theme plus user-saved custom themes.
 * Custom themes are stored in localStorage.
 */

export interface ColorTheme {
  id: string;
  name: string;
  colors: string[];
}

const STORAGE_KEY = 'partners_color_themes';

/** Built-in Classic theme (R/Y/G/B/O/M). */
export const CLASSIC_THEME: ColorTheme = {
  id: 'classic',
  name: 'Classic',
  colors: ['#e7372d', '#fbc62f', '#52b44f', '#0095d3', '#e67e22', '#d33682'],
};

/** Load custom themes from localStorage. */
export function loadCustomThemes(): ColorTheme[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t: unknown): t is ColorTheme =>
        t != null &&
        typeof t === 'object' &&
        typeof (t as ColorTheme).id === 'string' &&
        typeof (t as ColorTheme).name === 'string' &&
        Array.isArray((t as ColorTheme).colors) &&
        (t as ColorTheme).colors.every((c) => typeof c === 'string' && /^#[0-9A-Fa-f]{6}$/.test(c))
    );
  } catch {
    return [];
  }
}

/** Save custom themes to localStorage. */
export function saveCustomThemes(themes: ColorTheme[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(themes));
  } catch {
    // ignore
  }
}

/** All available themes: Classic + custom. */
export function getAllThemes(): ColorTheme[] {
  return [CLASSIC_THEME, ...loadCustomThemes()];
}

/** Add or update a custom theme. */
export function saveTheme(theme: ColorTheme): void {
  const custom = loadCustomThemes();
  const idx = custom.findIndex((t) => t.id === theme.id);
  const next = idx >= 0 ? [...custom] : [...custom, theme];
  if (idx >= 0) next[idx] = theme;
  saveCustomThemes(next);
}

/** Delete a custom theme by id. */
export function deleteTheme(id: string): void {
  if (id === CLASSIC_THEME.id) return;
  saveCustomThemes(loadCustomThemes().filter((t) => t.id !== id));
}

/** Generate a unique id for a new custom theme. */
export function generateThemeId(): string {
  const existing = loadCustomThemes().map((t) => t.id);
  let n = 0;
  while (existing.includes(`custom-${n}`)) n++;
  return `custom-${n}`;
}

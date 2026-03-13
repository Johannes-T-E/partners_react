/**
 * Board themes: style, player colors, and backgrounds bundled together.
 * Built-in "Classic" theme plus user-saved custom themes in localStorage.
 */

import { DEFAULT_BASE_PALETTE } from './color-utils';
import { getBasePaletteForDisplay, type BoardLayoutConfig } from './board-layout-config';

/** Theme data that can be applied to a board layout config. */
export interface BoardTheme {
  id: string;
  name: string;
  /** Player colors (hex, typically 18 for extended palette). */
  playerColors: string[];
  colorTheme: 'distinct' | 'partners';
  strokeWidth: number;
  /** Stroke/outline color (optional for backward compat with saved themes). */
  outlineColor?: string;
  homeSunburstExtent: number;
  debugTrackLabels: boolean;
  boardBgPctInner: number;
  boardBgTransition: number;
  boardBgColorInner: string;
  boardBgColorOuter: string;
  boardBgCirclePctInner: number;
  boardBgCircleTransitionCenter: number;
}

const STORAGE_KEY = 'partners_board_themes';

/** Extract theme data from a layout config. */
export function configToTheme(id: string, name: string, config: BoardLayoutConfig): BoardTheme {
  const base = getBasePaletteForDisplay(config);
  return {
    id,
    name,
    playerColors: base.slice(0, 6),
    colorTheme: config.colorTheme ?? 'distinct',
    strokeWidth: config.strokeWidth,
    outlineColor: config.outlineColor,
    homeSunburstExtent: config.homeSunburstExtent,
    debugTrackLabels: config.debugTrackLabels ?? false,
    boardBgPctInner: config.boardBgPctInner,
    boardBgTransition: config.boardBgTransition,
    boardBgColorInner: config.boardBgColorInner,
    boardBgColorOuter: config.boardBgColorOuter,
    boardBgCirclePctInner: config.boardBgCirclePctInner,
    boardBgCircleTransitionCenter: config.boardBgCircleTransitionCenter,
  };
}

/** Apply theme to config (derives burst/spot from player colors). */
export function applyThemeToConfig(config: BoardLayoutConfig, theme: BoardTheme): BoardLayoutConfig {
  const colors = [...theme.playerColors];
  return {
    ...config,
    basePlayerColors: colors,
    colorTheme: theme.colorTheme,
    strokeWidth: theme.strokeWidth,
    outlineColor: theme.outlineColor ?? config.outlineColor ?? '#000',
    homeSunburstExtent: theme.homeSunburstExtent,
    debugTrackLabels: theme.debugTrackLabels,
    boardBgPctInner: theme.boardBgPctInner,
    boardBgTransition: theme.boardBgTransition,
    boardBgColorInner: theme.boardBgColorInner,
    boardBgColorOuter: theme.boardBgColorOuter,
    boardBgCirclePctInner: theme.boardBgCirclePctInner,
    boardBgCircleTransitionCenter: theme.boardBgCircleTransitionCenter,
  };
}

/** Check if config matches a theme (theme-related fields equal). */
export function configMatchesTheme(config: BoardLayoutConfig, theme: BoardTheme): boolean {
  const base = getBasePaletteForDisplay(config);
  if (base.length < 6 || theme.playerColors.length < 6) return false;
  for (let i = 0; i < 6; i++) {
    if ((base[i] ?? '') !== (theme.playerColors[i] ?? '')) return false;
  }
  return (
    (config.colorTheme ?? 'distinct') === theme.colorTheme &&
    config.strokeWidth === theme.strokeWidth &&
    (config.outlineColor ?? '#000') === (theme.outlineColor ?? '#000') &&
    config.homeSunburstExtent === theme.homeSunburstExtent &&
    (config.debugTrackLabels ?? false) === theme.debugTrackLabels &&
    config.boardBgPctInner === theme.boardBgPctInner &&
    config.boardBgTransition === theme.boardBgTransition &&
    config.boardBgColorInner === theme.boardBgColorInner &&
    config.boardBgColorOuter === theme.boardBgColorOuter &&
    config.boardBgCirclePctInner === theme.boardBgCirclePctInner &&
    config.boardBgCircleTransitionCenter === theme.boardBgCircleTransitionCenter
  );
}

/** Built-in Classic theme. */
export const CLASSIC_THEME: BoardTheme = {
  id: 'classic',
  name: 'Classic',
  playerColors: [...DEFAULT_BASE_PALETTE],
  colorTheme: 'distinct',
  strokeWidth: 1.2,
  outlineColor: '#000',
  homeSunburstExtent: 0.5,
  debugTrackLabels: false,
  boardBgPctInner: 50,
  boardBgTransition: 0.5,
  boardBgColorInner: '#323232',
  boardBgColorOuter: '#191919',
  boardBgCirclePctInner: 70,
  boardBgCircleTransitionCenter: 0.5,
};

function loadCustomThemes(): BoardTheme[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t: unknown): t is BoardTheme => {
      if (t == null || typeof t !== 'object') return false;
      const x = t as Record<string, unknown>;
      return (
        typeof x.id === 'string' &&
        typeof x.name === 'string' &&
        Array.isArray(x.playerColors) &&
        (x.playerColors as unknown[]).every((c) => typeof c === 'string' && /^#[0-9A-Fa-f]{6}$/.test(c)) &&
        (x.colorTheme === 'distinct' || x.colorTheme === 'partners') &&
        typeof x.strokeWidth === 'number' &&
        (x.outlineColor === undefined || (typeof x.outlineColor === 'string' && /^#[0-9A-Fa-f]{6}$/.test(x.outlineColor))) &&
        typeof x.homeSunburstExtent === 'number' &&
        typeof x.debugTrackLabels === 'boolean' &&
        typeof x.boardBgPctInner === 'number' &&
        typeof x.boardBgTransition === 'number' &&
        typeof x.boardBgColorInner === 'string' &&
        typeof x.boardBgColorOuter === 'string' &&
        typeof x.boardBgCirclePctInner === 'number' &&
        typeof x.boardBgCircleTransitionCenter === 'number'
      );
    });
  } catch {
    return [];
  }
}

function saveCustomThemes(themes: BoardTheme[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(themes));
  } catch {
    // ignore
  }
}

export function getAllBoardThemes(): BoardTheme[] {
  return [CLASSIC_THEME, ...loadCustomThemes()];
}

export function saveBoardTheme(theme: BoardTheme): void {
  const custom = loadCustomThemes();
  const idx = custom.findIndex((t) => t.id === theme.id);
  const next = idx >= 0 ? [...custom] : [...custom, theme];
  if (idx >= 0) next[idx] = theme;
  saveCustomThemes(next);
}

export function deleteBoardTheme(id: string): void {
  if (id === CLASSIC_THEME.id) return;
  saveCustomThemes(loadCustomThemes().filter((t) => t.id !== id));
}

export function generateBoardThemeId(): string {
  const existing = loadCustomThemes().map((t) => t.id);
  let n = 0;
  while (existing.includes(`custom-${n}`)) n++;
  return `custom-${n}`;
}

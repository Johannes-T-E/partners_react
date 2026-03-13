/**
 * Board layout configuration: visual and structural parameters for the responsive board.
 * No dependency on game engine (src/). Single source of truth for how the board looks.
 */
import { deriveBurstColor, deriveSpotColor, DEFAULT_BASE_PALETTE } from './color-utils';

/** All customizable layout parameters. */
export interface BoardLayoutConfig {
  /** Number of players (and arms/start tiles). */
  playerCount: number;
  /** Track tiles per player (main track length = playerCount * trackTilesPerPlayer). */
  trackTilesPerPlayer: number;
  /** Pawns per player. */
  pawnsPerPlayer: number;
  /** End zone slots per color (path from entrance to innermost). */
  endZoneSlots: number;

  /** Track: center radius (centerline of the track). */
  trackCenterRadius: number;
  /** Track: thickness (inner/outer radius = center ± thickness/2). */
  trackThickness: number;

  /** View: width and height of the SVG viewBox. */
  viewSize: number;

  /** Arm from track to home circle: length. */
  armLength: number;
  /** Home circle radius at end of arm. */
  homeRadius: number;
  /** Home spot (pawn start) circle radius. */
  homeSpotRadius: number;
  /** Step for 2x2 grid of home slots (distance from home center to each slot). */
  homeSpotGridStep: number;
  /** Home circle sunburst: radius of bright center (e.g. homeRadius * 1.5). */
  homeCircleRadius: number;
  /** Bigger circle at end of paddle (arc); e.g. homeRadius * 2. */
  armBigCircleRadius: number;

  /** End zone: distance from track centerline inward for each slot (outermost to innermost). */
  endRadii: number[];
  /** End zone: spot radius for drawing each slot. */
  endSpotRadii: number[];

  /** Pawn (mover) circle radius. */
  moverRadius: number;

  /** Flower-petal track tiles: outer arc radius for rounded "head". */
  trackPetalRadius: number;

  /** Draw circle index and T-index on each track segment (debug). */
  debugTrackLabels: boolean;

  /** Player colors (hex), in seat order [0..playerCount-1]. Used for rendering. */
  playerColors: string[];
  /** Base color palette (hex). User-edited; never changes when switching themes. */
  basePlayerColors?: string[];
  /** Player arm angles in degrees (same order as playerColors). */
  playerAngles: number[];
  /** Optional short labels for start tiles (e.g. ['R','Y','G','B']). */
  playerColorNames?: string[];

  /** Color theme: distinct (one color per player) or partners (partner pairs share a color). */
  colorTheme?: 'distinct' | 'partners';

  /** Home circle sunburst center color per player (hex). */
  homeCircleCenterColors: string[];
  /** Home spot fill (slightly darker) per player (hex). */
  homeSpotFillColors: string[];
  /** Home circle: fraction of radius where the bright center is held (0–1). */
  homeSunburstExtent: number;

  /** Outline/stroke color. */
  outlineColor: string;
  /** Default stroke width. */
  strokeWidth: number;
  /** Home spot stroke width. */
  homeSpotStrokeWidth: number;

  /** Board background radial gradient (full rect): inner % (0–100), rest is outer. */
  boardBgPctInner: number;
  boardBgTransition: number;
  boardBgColorInner: string;
  boardBgColorOuter: string;
  /** Inner circle (inside track) gradient: inner % (0–100). */
  boardBgCirclePctInner: number;
  boardBgCircleTransitionCenter: number;
}

/** Extended palette size (18 standard colors). Above this we use dynamic HSL colors unless user has custom. */
export const EXTENDED_PALETTE_SIZE = DEFAULT_BASE_PALETTE.length;

/** Sanity cap for player count (avoids browser hang; dynamic colors when playerCount > EXTENDED_PALETTE_SIZE). */
export const MAX_PLAYER_COUNT = 999;

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

/** Generate n visually distinct colors (main, home center, home spot) for dynamic player count. */
export function getDynamicColorsForPlayerCount(n: number): {
  playerColors: string[];
  homeCircleCenterColors: string[];
  homeSpotFillColors: string[];
  playerColorNames: string[];
} {
  const playerColors: string[] = [];
  const homeCircleCenter: string[] = [];
  const homeSpotFill: string[] = [];
  const names: string[] = [];
  for (let i = 0; i < n; i++) {
    const hue = (i * 360) / Math.max(1, n);
    playerColors.push(hslToHex(hue, 0.75, 0.52));
    homeCircleCenter.push(hslToHex(hue, 0.8, 0.58));
    homeSpotFill.push(hslToHex(hue, 0.7, 0.42));
    names.push(String(i));
  }
  return { playerColors, homeCircleCenterColors: homeCircleCenter, homeSpotFillColors: homeSpotFill, playerColorNames: names };
}

/**
 * Default player angles in degrees, evenly spaced around the circle.
 * 2 and 4 players: player 0 at 225° (bottom-left) for symmetric quadrants.
 * 3, 5, 6 players: player 0 at 270° (bottom) so the wheel is symmetric about the vertical axis.
 * Then clockwise (decreasing angle) for subsequent players.
 */
export function getDefaultPlayerAngles(playerCount: number): number[] {
  const n = Math.max(1, playerCount);
  const step = 360 / n;
  const startAngle = n === 2 || n === 4 ? 225 : 270;
  const angles: number[] = [];
  for (let i = 0; i < n; i++) {
    let a = startAngle - i * step;
    if (a < 0) a += 360;
    if (a >= 360) a -= 360;
    angles.push(a);
  }
  return angles;
}

/** Partner group index: 2 → 0,1 (separate); even n → i % (n/2); odd → distinct. */
function getPartnerGroupIndex(playerIdx: number, playerCount: number): number {
  if (playerCount === 2) return playerIdx;
  if (playerCount % 2 === 0) return playerIdx % (playerCount / 2);
  return playerIdx;
}

/**
 * Extract the base 6-color palette from overrides, preserving the canonical order (R,Y,G,B,O,M).
 * When switching from Partners to Distinct, overrides contain the mapped array (e.g. [R,Y,R,Y,O,M]).
 * Reverse the partners mapping to recover base indices: 0..numGroups-1 and playerCount..5.
 */
function extractBasePalette(ov: string[], base: string[], playerCount: number): string[] {
  const numGroups = playerCount === 2 ? 2 : playerCount / 2;
  const result = [...base];
  for (let i = 0; i < numGroups && i < ov.length; i++) result[i] = ov[i];
  for (let i = playerCount; i < base.length && i < ov.length; i++) result[i] = ov[i];
  return result;
}

/** Get the base color palette for display/editing. Never the mapped array. */
export function getBasePaletteForDisplay(config: BoardLayoutConfig): string[] {
  if (config.basePlayerColors && config.basePlayerColors.length > 0) return config.basePlayerColors;
  const pc = config.playerColors ?? [];
  const playerCount = config.playerCount ?? 4;
  const firstN = pc.slice(0, playerCount);
  const hasDuplicates = firstN.length > new Set(firstN).size;
  if (!hasDuplicates || pc.length > EXTENDED_PALETTE_SIZE) return pc.length > 0 ? pc : [...DEFAULT_BASE_PALETTE];
  const uniqueCount = new Set(firstN).size;
  const recoveryPlayerCount = uniqueCount === 2 ? 2 : uniqueCount === 3 ? 6 : 4;
  return extractBasePalette(pc, [...DEFAULT_BASE_PALETTE], recoveryPlayerCount);
}

/**
 * Default layout that matches the current board look: 4 players, 14 tiles/player,
 * 4 pawns, Red/Yellow/Green/Blue, current radii and angles.
 * When playerCount or pawnsPerPlayer change, structure-dependent arrays (playerAngles,
 * playerColors, endRadii, etc.) are recomputed to match the old app's formToConfig logic.
 */
export function createDefaultBoardLayoutConfig(
  overrides?: Partial<BoardLayoutConfig>
): BoardLayoutConfig {
  const playerCount = overrides?.playerCount ?? 4;
  const pawnsPerPlayer = overrides?.pawnsPerPlayer ?? 4;
  const colorTheme = overrides?.colorTheme ?? 'distinct';
  const partnersApplies = colorTheme === 'partners' && playerCount >= 4 && playerCount % 2 === 0;
  const numGroups = partnersApplies ? playerCount / 2 : playerCount;
  const requiredColors = partnersApplies ? numGroups : playerCount;
  const basePaletteLen = (overrides?.basePlayerColors?.length ?? overrides?.playerColors?.length ?? 0);
  const hasEnoughCustomColors = basePaletteLen >= requiredColors;
  const useDynamicColors = playerCount > EXTENDED_PALETTE_SIZE
    && !(partnersApplies && numGroups <= EXTENDED_PALETTE_SIZE)
    && !hasEnoughCustomColors;
  const dynamicColors = useDynamicColors ? getDynamicColorsForPlayerCount(playerCount) : null;

  // Always recompute playerAngles from playerCount - never use stale overrides with wrong length
  const playerAngles = getDefaultPlayerAngles(playerCount);

  let playerColors: string[];
  let homeCircleCenter: string[];
  let homeSpotFill: string[];
  let playerColorNames: string[];
  let basePalette: string[] | undefined;

  if (useDynamicColors && dynamicColors) {
    playerColors = dynamicColors.playerColors;
    homeCircleCenter = dynamicColors.homeCircleCenterColors;
    homeSpotFill = dynamicColors.homeSpotFillColors;
    playerColorNames = dynamicColors.playerColorNames;
  } else {
    const defaultBase = [...DEFAULT_BASE_PALETTE];
    // Base palette: prefer basePlayerColors (user's palette, never changes with theme), else overrides.playerColors
    basePalette = overrides?.basePlayerColors ?? overrides?.playerColors;
    const ovLen = basePalette?.length ?? 0;
    const useOverrides = ovLen >= requiredColors || (ovLen > 0 && ovLen <= EXTENDED_PALETTE_SIZE);
    if (!useOverrides || !basePalette) basePalette = defaultBase;
    else if (ovLen > 0 && ovLen <= EXTENDED_PALETTE_SIZE) {
      // When overrides contain a mapped array (e.g. [R,Y,R,Y,O,M] from partners), extract the base
      const firstN = basePalette.slice(0, playerCount);
      const hasDuplicates = firstN.length > new Set(firstN).size;
      if (hasDuplicates && playerCount >= 2 && playerCount <= EXTENDED_PALETTE_SIZE) {
        const uniqueCount = new Set(firstN).size;
        const recoveryPlayerCount = uniqueCount === 2 ? 2 : uniqueCount === 3 ? 6 : 4;
        basePalette = extractBasePalette(basePalette, defaultBase, recoveryPlayerCount);
      }
    }
    // Always derive burst/spot from base palette. Never use overrides here—after Partners they
    // contain the mapped array, which would produce wrong gradients when switching back to Distinct.
    const palette = basePalette ?? defaultBase;
    const baseBurstPalette = palette.map(deriveBurstColor);
    const baseSpotPalette = palette.map(deriveSpotColor);
    const arrLen = Math.max(EXTENDED_PALETTE_SIZE, playerCount);
    const palLen = palette.length;
    // playerColors = per-player for rendering. Partners only applies for 4, 6, 8... players.
    playerColors = partnersApplies
      ? [...Array(arrLen)].map((_, i) => i < playerCount ? palette[getPartnerGroupIndex(i, playerCount) % numGroups] : palette[i % palLen])
      : palette;
    homeCircleCenter = partnersApplies
      ? [...Array(arrLen)].map((_, i) => i < playerCount ? baseBurstPalette[getPartnerGroupIndex(i, playerCount) % numGroups] : baseBurstPalette[i % palLen])
      : baseBurstPalette;
    homeSpotFill = partnersApplies
      ? [...Array(arrLen)].map((_, i) => i < playerCount ? baseSpotPalette[getPartnerGroupIndex(i, playerCount) % numGroups] : baseSpotPalette[i % palLen])
      : baseSpotPalette;
    playerColorNames = [...['R', 'Y', 'G', 'B', 'O', 'M'], ...Array.from({ length: Math.max(0, arrLen - 6) }, (_, i) => String(i + 6))];
  }

  // Always recompute endRadii/endSpotRadii from pawnsPerPlayer - never use stale overrides
  const endRadii = getDefaultEndRadii(pawnsPerPlayer);
  const endSpotRadii = getDefaultEndSpotRadii(pawnsPerPlayer);

  const config: BoardLayoutConfig = {
    playerCount,
    trackTilesPerPlayer: overrides?.trackTilesPerPlayer ?? 14,
    pawnsPerPlayer,
    endZoneSlots: overrides?.endZoneSlots ?? pawnsPerPlayer,

    trackCenterRadius: 280,
    trackThickness: 55,

    viewSize: 900,

    armLength: 82,
    homeRadius: 24,
    homeSpotRadius: 12,
    homeSpotGridStep: 12,
    homeCircleRadius: 24 * 1.5,
    armBigCircleRadius: 24 * 2,

    endRadii,
    endSpotRadii,

    moverRadius: 10,
    trackPetalRadius: 30,
    debugTrackLabels: false,
    colorTheme,

    ...(basePalette && { basePlayerColors: basePalette }),
    playerColors,
    playerAngles,
    playerColorNames,

    homeCircleCenterColors: homeCircleCenter,
    homeSpotFillColors: homeSpotFill,
    homeSunburstExtent: 0.5,

    outlineColor: '#000',
    strokeWidth: 1.2,
    homeSpotStrokeWidth: 3,

    boardBgPctInner: 50,
    boardBgTransition: 0.5,
    boardBgColorInner: '#323232',
    boardBgColorOuter: '#191919',
    boardBgCirclePctInner: 70,
    boardBgCircleTransitionCenter: 0.5,
  };

  // Merge overrides, but exclude structure-dependent fields that we recomputed
  // so they are never overwritten with stale values from a different playerCount/pawnsPerPlayer
  const { playerCount: _pc, pawnsPerPlayer: _pp, playerAngles: _pa, endRadii: _er, endSpotRadii: _es, playerColors: _pcol, homeCircleCenterColors: _hcc, homeSpotFillColors: _hsf, ...safeOverrides } = overrides ?? {};
  return { ...config, ...safeOverrides };
}

/** Default end zone slot distances from track centerline inward (outermost to innermost). Scales with n. */
export function getDefaultEndRadii(n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [95];
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(60 + (130 - 60) * (i / (n - 1)));
  }
  return out;
}

/** Default end zone spot radii (drawing size); outermost largest, innermost smallest. */
export function getDefaultEndSpotRadii(n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [17];
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(20 - (20 - 14) * (i / (n - 1)));
  }
  return out;
}

/** Derived: total circle segments = start tiles + track segments (playerCount + playerCount * trackTilesPerPlayer). */
export function getCircleTileCount(config: BoardLayoutConfig): number {
  return config.playerCount + config.playerCount * config.trackTilesPerPlayer;
}

/** Derived: start segment indices (one per player, evenly spaced). */
export function getStartCircleIndices(config: BoardLayoutConfig): number[] {
  const circleTiles = getCircleTileCount(config);
  const step = circleTiles / config.playerCount;
  const indices: number[] = [];
  for (let i = 0; i < config.playerCount; i++) {
    indices.push(Math.floor(i * step));
  }
  return indices;
}

/** Derived: ordered list of circle segment indices that are track (non-start). */
export function getTrackSegmentsOrdered(config: BoardLayoutConfig): number[] {
  const circleTiles = getCircleTileCount(config);
  const startIndices = getStartCircleIndices(config);
  const list: number[] = [];
  for (let s = 0; s < circleTiles; s++) {
    if (startIndices.includes(s)) continue;
    list.push(s);
  }
  return list;
}

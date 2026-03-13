/**
 * Board layout configuration: visual and structural parameters for the responsive board.
 * No dependency on game engine (src/). Single source of truth for how the board looks.
 */

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

  /** Player colors (hex), in seat order [0..playerCount-1]. */
  playerColors: string[];
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

/** Sanity cap for player count (avoids browser hang; dynamic colors when playerCount > 6). */
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

/**
 * Default layout that matches the current board look: 4 players, 14 tiles/player,
 * 4 pawns, Red/Yellow/Green/Blue, current radii and angles.
 */
export function createDefaultBoardLayoutConfig(
  overrides?: Partial<BoardLayoutConfig>
): BoardLayoutConfig {
  const playerCount = overrides?.playerCount ?? 4;
  const pawnsPerPlayer = overrides?.pawnsPerPlayer ?? 4;
  const useDynamicColors = playerCount > 6;
  const dynamicColors = useDynamicColors ? getDynamicColorsForPlayerCount(playerCount) : null;
  const playerColors = useDynamicColors ? dynamicColors!.playerColors : ['#e7372d', '#fbc62f', '#52b44f', '#0095d3', '#e67e22', '#d33682']; // R, Y, G, B, O, M
  const homeCircleCenter = useDynamicColors ? dynamicColors!.homeCircleCenterColors : ['#eb5531', '#faea2a', '#92c447', '#00b0e6', '#f39c12', '#e84a8f']; // R,Y,G,B,O,M
  const homeSpotFill = useDynamicColors ? dynamicColors!.homeSpotFillColors : ['#c42e24', '#d99a1e', '#3d9a3a', '#007bb8', '#ca6f1e', '#a8286a']; // R,Y,G,B,O,M
  const playerColorNames = useDynamicColors ? dynamicColors!.playerColorNames : ['R', 'Y', 'G', 'B', 'O', 'M'];
  const playerAngles = overrides?.playerAngles ?? getDefaultPlayerAngles(playerCount);

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

    endRadii: getDefaultEndRadii(pawnsPerPlayer),
    endSpotRadii: getDefaultEndSpotRadii(pawnsPerPlayer),

    moverRadius: 10,
    trackPetalRadius: 30,
    debugTrackLabels: false,
    colorTheme: overrides?.colorTheme ?? 'distinct',

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

  return { ...config, ...overrides };
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

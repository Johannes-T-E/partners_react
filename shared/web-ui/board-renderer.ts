import type { Action, BoardConfig, Card, GameState, Mover, NodeId } from '../src/types.js';
import { getPlayerIndex } from '../src/types.js';
import { parseNodeId } from '../src/board.js';
import {
  createDefaultBoardLayoutConfig,
  getCircleTileCount,
  getStartCircleIndices,
  getTrackSegmentsOrdered,
  type BoardLayoutConfig,
} from './board-layout-config.js';

export { createDefaultBoardLayoutConfig, type BoardLayoutConfig } from './board-layout-config.js';

/** Track segment color: order is counter-clockwise [0, N-1, N-2, ..., 1]. First tile after each start = previous player (counter-clockwise). Returns player index for layout colors. */
function trackSegmentPlayerIndex(circleIndex: number, layout: BoardLayoutConfig): number {
  const n = layout.playerCount;
  const segmentsPerBlock = layout.trackTilesPerPlayer + 1;
  const block = Math.floor(circleIndex / segmentsPerBlock);
  const ownerPlayer = block % n;
  const posInStreet = (circleIndex % segmentsPerBlock) - 1;
  if (posInStreet < 0) return ownerPlayer;
  const idx = (ownerPlayer + n - 1 - posInStreet) % n;
  return idx < 0 ? idx + n : idx;
}

function deg2rad(d: number): number {
  return (d * Math.PI) / 180;
}

/** Magma colormap: t in [0,1] -> hex. Black -> purple -> red -> orange -> yellow -> white. */
function magmaColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const stops: { t: number; r: number; g: number; b: number }[] = [
    { t: 0, r: 0, g: 0, b: 4 },
    { t: 0.15, r: 59, g: 15, b: 112 },
    { t: 0.35, r: 140, g: 41, b: 129 },
    { t: 0.55, r: 222, g: 73, b: 104 },
    { t: 0.75, r: 254, g: 159, b: 109 },
    { t: 1, r: 252, g: 253, b: 191 },
  ];
  let i = 0;
  while (i < stops.length - 1 && stops[i + 1].t < clamped) i++;
  const a = stops[i];
  const b = stops[Math.min(i + 1, stops.length - 1)];
  const local = (clamped - a.t) / (b.t - a.t || 1);
  const r = Math.round(a.r + (b.r - a.r) * local);
  const g = Math.round(a.g + (b.g - a.g) * local);
  const bl = Math.round(a.b + (b.b - a.b) * local);
  return '#' + [r, g, bl].map((x) => Math.min(255, Math.max(0, x)).toString(16).padStart(2, '0')).join('');
}

/** Darken a hex color by a factor (0–1; lower = darker). */
function darkenHex(hex: string, factor: number): string {
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * factor);
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * factor);
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * factor);
  return '#' + [r, g, b].map((x) => Math.min(255, x).toString(16).padStart(2, '0')).join('');
}

/** Center angle (degrees) of circle segment; segment 0 = first player's angle. */
function circleSegmentCenterAngleDeg(circleIndex: number, layout: BoardLayoutConfig): number {
  const circleTiles = getCircleTileCount(layout);
  const angleStep = 360 / circleTiles;
  return layout.playerAngles[0] - circleIndex * angleStep;
}

/** Map engine track index (0..mainTrackLength-1) to circle segment index. */
function engineTrackToCircleSegment(
  trackIndex: number,
  mainTrackLength: number,
  layout: BoardLayoutConfig
): number {
  const trackSegments = getTrackSegmentsOrdered(layout);
  const idx = Math.min(
    Math.round((trackIndex * trackSegments.length) / mainTrackLength),
    trackSegments.length - 1
  );
  return trackSegments[idx];
}

/** Circle segment index -> engine track index, or null for start segments. */
function circleSegmentToTrackIndex(
  circleIndex: number,
  mainTrackLength: number,
  layout: BoardLayoutConfig
): number | null {
  const startIndices = getStartCircleIndices(layout);
  const trackSegments = getTrackSegmentsOrdered(layout);
  if (startIndices.includes(circleIndex)) return null;
  const p = trackSegments.indexOf(circleIndex);
  if (p < 0) return null;
  return Math.min(
    Math.round((p * mainTrackLength) / trackSegments.length),
    mainTrackLength - 1
  );
}

function angleForCircleSegment(circleIndex: number, layout: BoardLayoutConfig): number {
  return deg2rad(circleSegmentCenterAngleDeg(circleIndex, layout));
}

function angleForTrackIndex(i: number, board: BoardConfig, layout: BoardLayoutConfig): number {
  const seg = engineTrackToCircleSegment(i, board.mainTrackLength, layout);
  return angleForCircleSegment(seg, layout);
}

function polarToXY(r: number, angleDeg: number): { x: number; y: number } {
  const a = deg2rad(angleDeg);
  return { x: r * Math.cos(a), y: -r * Math.sin(a) };
}

/**
 * Farthest intersection of ray from origin at angle aDeg with circle centered at (cx, cy) and radius r.
 * Returns the point on the circle on the given ray (the one farther from origin), or null if no intersection.
 */
function rayCircleOuterIntersection(cx: number, cy: number, r: number, aDeg: number): { x: number; y: number } | null {
  const a = deg2rad(aDeg);
  const dx = Math.cos(a);
  const dy = -Math.sin(a);
  const K = cx * dx + cy * dy;
  const disc = K * K - (cx * cx + cy * cy - r * r);
  if (disc < 0) return null;
  const t = K + Math.sqrt(disc);
  return { x: t * dx, y: t * dy };
}

/** SVG arc from angle0 to angle1 (degrees), radius r. Uses short arc (sweep so inner track edge follows the circle). */
function arcPath(r: number, angle0Deg: number, angle1Deg: number): string {
  const a0 = deg2rad(angle0Deg);
  const a1 = deg2rad(angle1Deg);
  const x0 = r * Math.cos(a0);
  const y0 = -r * Math.sin(a0);
  const x1 = r * Math.cos(a1);
  const y1 = -r * Math.sin(a1);
  const large = Math.abs(angle1Deg - angle0Deg) > 180 ? 1 : 0;
  const sweep = angle1Deg > angle0Deg ? 0 : 1;
  return `M ${x0},${y0} A ${r},${r} 0 ${large},${sweep} ${x1},${y1}`;
}

/** SVG arc segment only (A command) from angle0 to angle1; short arc so inner track edge follows the circle. */
function arcSegment(r: number, angle0Deg: number, angle1Deg: number): string {
  const a1 = deg2rad(angle1Deg);
  const x1 = r * Math.cos(a1);
  const y1 = -r * Math.sin(a1);
  const large = Math.abs(angle1Deg - angle0Deg) > 180 ? 1 : 0;
  const sweep = angle1Deg > angle0Deg ? 0 : 1;
  return `A ${r},${r} 0 ${large},${sweep} ${x1},${y1}`;
}

/**
 * Tangent points from origin (0,0) to circle centered at (cx,cy) with radius R.
 * Returns [T1, T2] so that the arc from T1 to T2 (on the circle) that bulges away from origin is the "outer" arc.
 */
function tangentPointsFromOrigin(cx: number, cy: number, R: number): [{ x: number; y: number }, { x: number; y: number }] {
  const d = Math.sqrt(cx * cx + cy * cy);
  if (d <= R) return [{ x: cx + R, y: cy }, { x: cx - R, y: cy }]; // fallback
  const L = Math.sqrt(d * d - R * R);
  const sinBeta = R / d;
  const cosBeta = L / d;
  const ux = cx / d;
  const uy = cy / d;
  const T1 = {
    x: L * (ux * cosBeta - uy * sinBeta),
    y: L * (ux * sinBeta + uy * cosBeta),
  };
  const T2 = {
    x: L * (ux * cosBeta + uy * sinBeta),
    y: L * (-ux * sinBeta + uy * cosBeta),
  };
  return [T1, T2];
}

/** Angle of point (px,py) relative to center (cx,cy), in our y-up convention (degrees). */
function angleFromCenter(px: number, py: number, cx: number, cy: number): number {
  const rad = Math.atan2(-(py - cy), px - cx);
  return (rad * 180) / Math.PI;
}

function getStartCircleIndexForColor(color: string, layout: BoardLayoutConfig): number {
  const startIndices = getStartCircleIndices(layout);
  const pi = getPlayerIndex(color, layout.playerCount);
  return startIndices[pi] ?? 0;
}

export function nodeIdToXY(
  nodeId: NodeId,
  board: BoardConfig,
  layout: BoardLayoutConfig
): { x: number; y: number } {
  const p = parseNodeId(nodeId);
  if (!p) return { x: 0, y: 0 };

  const trackRadius = layout.trackCenterRadius;

  if (p.kind === 'T') {
    const angle = angleForTrackIndex(p.index, board, layout);
    return { x: trackRadius * Math.cos(angle), y: -trackRadius * Math.sin(angle) };
  }

  const angleDeg = layout.playerAngles[getPlayerIndex(p.color, layout.playerCount)];
  const base = polarToXY(trackRadius, angleDeg);

  if (p.kind === 'H' && p.slot !== undefined) {
    const offset = layout.armLength + layout.homeRadius;
    const dx = Math.cos(deg2rad(angleDeg)) * offset;
    const dy = -Math.sin(deg2rad(angleDeg)) * offset;
    const homeCenterX = base.x + dx;
    const homeCenterY = base.y + dy;
    const a = deg2rad(angleDeg);
    const alongX = Math.cos(a);
    const alongY = -Math.sin(a);
    const perpX = Math.sin(a);
    const perpY = Math.cos(a);
    const { rowOffset, colOffset, rows, cols } = homeSpotGridOffset(p.slot, layout.pawnsPerPlayer);
    const effectiveStep = layout.homeSpotGridStep * (2 / Math.max(rows, cols));
    return {
      x: homeCenterX + rowOffset * effectiveStep * alongX + colOffset * effectiveStep * perpX,
      y: homeCenterY + rowOffset * effectiveStep * alongY + colOffset * effectiveStep * perpY,
    };
  }

  if (p.kind === 'S') {
    const circleIndex = getStartCircleIndexForColor(p.color, layout);
    const angle = angleForCircleSegment(circleIndex, layout);
    return { x: trackRadius * Math.cos(angle), y: -trackRadius * Math.sin(angle) };
  }

  if (p.kind === 'E' && p.slot !== undefined) {
    const endR = layout.endRadii[p.slot] ?? layout.endRadii[0];
    const dist = trackRadius - endR;
    return polarToXY(dist, angleDeg);
  }

  return { x: 0, y: 0 };
}

/** Grid layout for home spots: cols = ceil(sqrt(n)), rows = ceil(n/cols), centered. */
function homeSpotGridOffset(slot: number, n: number): { rowOffset: number; colOffset: number; rows: number; cols: number } {
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const row = Math.floor(slot / cols);
  const col = slot % cols;
  const rowOffset = rows - 1 - 2 * row;
  const colOffset = 2 * col - (cols - 1);
  return { rowOffset, colOffset, rows, cols };
}

/** Position for a home spot or end slot by player index (for drawing; works for all layout players). */
function playerSlotToXY(
  playerIdx: number,
  kind: 'H' | 'E',
  slot: number,
  layout: BoardLayoutConfig
): { x: number; y: number } {
  const trackRadius = layout.trackCenterRadius;
  const angleDeg = layout.playerAngles[playerIdx];
  const base = polarToXY(trackRadius, angleDeg);

  if (kind === 'H') {
    const offset = layout.armLength + layout.homeRadius;
    const dx = Math.cos(deg2rad(angleDeg)) * offset;
    const dy = -Math.sin(deg2rad(angleDeg)) * offset;
    const homeCenterX = base.x + dx;
    const homeCenterY = base.y + dy;
    const a = deg2rad(angleDeg);
    const alongX = Math.cos(a);
    const alongY = -Math.sin(a);
    const perpX = Math.sin(a);
    const perpY = Math.cos(a);
    const { rowOffset, colOffset, rows, cols } = homeSpotGridOffset(slot, layout.pawnsPerPlayer);
    const effectiveStep = layout.homeSpotGridStep * (2 / Math.max(rows, cols));
    return {
      x: homeCenterX + rowOffset * effectiveStep * alongX + colOffset * effectiveStep * perpX,
      y: homeCenterY + rowOffset * effectiveStep * alongY + colOffset * effectiveStep * perpY,
    };
  }

  const endR = layout.endRadii[slot] ?? layout.endRadii[0];
  const dist = trackRadius - endR;
  return polarToXY(dist, angleDeg);
}

function getOccupancy(movers: Mover[]): Map<NodeId, Mover[]> {
  const map = new Map<NodeId, Mover[]>();
  for (const m of movers) {
    const list = map.get(m.pos) ?? [];
    list.push(m);
    map.set(m.pos, list);
  }
  return map;
}

function getColorFill(color: string, layout: BoardLayoutConfig): string {
  return layout.playerColors[getPlayerIndex(color, layout.playerCount)] ?? layout.playerColors[0];
}

function getHomeCircleCenter(color: string, layout: BoardLayoutConfig): string {
  return layout.homeCircleCenterColors[getPlayerIndex(color, layout.playerCount)] ?? layout.homeCircleCenterColors[0];
}

function getHomeSpotFill(color: string, layout: BoardLayoutConfig): string {
  return layout.homeSpotFillColors[getPlayerIndex(color, layout.playerCount)] ?? layout.homeSpotFillColors[0];
}

/** Override position for a mover during animation (screen coords). */
export type MoverPositionOverride = { x: number; y: number };

/** When set, highlight these players' petals with gold sparkly win style (both team members). */
export type WinningPlayerIndices = number[];

export interface HeatmapRenderOptions {
  /** Desaturate board colors to gray/white so heatmap stands out. */
  heatmapMode?: boolean;
  /** Visit counts per circle segment index. When set, tiles are colored by magma. */
  heatmapSegmentCounts?: number[];
}

export function renderBoard(
  svg: SVGSVGElement,
  state: GameState,
  layoutConfig?: BoardLayoutConfig,
  highlightPlayerIndex?: number | null,
  moverPositionOverrides?: Record<string, MoverPositionOverride>,
  winningPlayerIndices?: WinningPlayerIndices,
  heatmapOptions?: HeatmapRenderOptions
): void {
  const layout = layoutConfig ?? createDefaultBoardLayoutConfig();
  const board = state.board;
  const heatmapMode = heatmapOptions?.heatmapMode ?? false;
  const heatmapSegmentCounts = heatmapOptions?.heatmapSegmentCounts;
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.id = 'board-root';

  const circleTiles = getCircleTileCount(layout);
  const startCircleIndices = getStartCircleIndices(layout);
  const trackSegmentsOrdered = getTrackSegmentsOrdered(layout);
  const angleStep = 360 / circleTiles;
  const rIn = layout.trackCenterRadius - layout.trackThickness / 2;
  const rOut = layout.trackCenterRadius + layout.trackThickness / 2;

  const half = layout.viewSize / 2;
  svg.setAttribute('viewBox', `${-half} ${-half} ${layout.viewSize} ${layout.viewSize}`);

  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }
  if (!svg.querySelector('#folded-desaturate')) {
    const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter.id = 'folded-desaturate';
    filter.setAttribute('x', '-20%');
    filter.setAttribute('y', '-20%');
    filter.setAttribute('width', '140%');
    filter.setAttribute('height', '140%');
    const fe = document.createElementNS('http://www.w3.org/2000/svg', 'feColorMatrix');
    fe.setAttribute('in', 'SourceGraphic');
    fe.setAttribute('type', 'saturate');
    fe.setAttribute('values', '0.35');
    filter.appendChild(fe);
    defs!.appendChild(filter);
  }

  // —— Board background 1: full rect with two-color radial fade ——
  svg.querySelector('#board-bg')?.remove();
  svg.querySelector('#board-bg-circle')?.remove();
  const t = Math.max(0, Math.min(0.5, layout.boardBgTransition));
  const o = layout.boardBgPctInner / 100;
  const a = Math.max(0, o - t);
  const b = Math.min(1, o + t);
  const addStopsToBgGrad = (grad: SVGRadialGradientElement) => {
    const addStop = (offset: number, color: string) => {
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      s.setAttribute('offset', String(offset));
      s.setAttribute('stop-color', color);
      grad.appendChild(s);
    };
    addStop(0, layout.boardBgColorInner);
    addStop(a, layout.boardBgColorInner);
    addStop(b, layout.boardBgColorOuter);
    addStop(1, layout.boardBgColorOuter);
  };
  const bgGrad = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
  bgGrad.id = 'board-bg';
  bgGrad.setAttribute('gradientUnits', 'userSpaceOnUse');
  bgGrad.setAttribute('cx', '0');
  bgGrad.setAttribute('cy', '0');
  const bgExtent = half * 4; // extend background 4x so it fills viewport when panning/zooming
  bgGrad.setAttribute('r', String(Math.ceil(bgExtent * Math.SQRT2))); // cover rect corners
  addStopsToBgGrad(bgGrad);
  defs!.appendChild(bgGrad);
  const oc = layout.boardBgCirclePctInner / 100;
  const tCenter = Math.max(0, Math.min(0.5, layout.boardBgCircleTransitionCenter));
  const ac = Math.max(0, oc - tCenter);
  const bc = Math.min(1, oc + tCenter);
  const addStopsToCircleGrad = (grad: SVGRadialGradientElement) => {
    const addStop = (offset: number, color: string) => {
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      s.setAttribute('offset', String(offset));
      s.setAttribute('stop-color', color);
      grad.appendChild(s);
    };
    addStop(0, layout.boardBgColorInner);
    addStop(ac, layout.boardBgColorInner);
    addStop(bc, layout.boardBgColorOuter);
    addStop(1, layout.boardBgColorOuter);
  };
  const bgCircleGrad = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
  bgCircleGrad.id = 'board-bg-circle';
  bgCircleGrad.setAttribute('gradientUnits', 'userSpaceOnUse');
  bgCircleGrad.setAttribute('cx', '0');
  bgCircleGrad.setAttribute('cy', '0');
  bgCircleGrad.setAttribute('r', String(layout.trackCenterRadius));
  addStopsToCircleGrad(bgCircleGrad);
  defs!.appendChild(bgCircleGrad);
  const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bgRect.setAttribute('x', String(-bgExtent));
  bgRect.setAttribute('y', String(-bgExtent));
  bgRect.setAttribute('width', String(bgExtent * 2));
  bgRect.setAttribute('height', String(bgExtent * 2));
  bgRect.setAttribute('fill', 'url(#board-bg)');
  g.appendChild(bgRect);
  const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  bgCircle.setAttribute('cx', '0');
  bgCircle.setAttribute('cy', '0');
  bgCircle.setAttribute('r', String(layout.trackCenterRadius));
  bgCircle.setAttribute('fill', 'url(#board-bg-circle)');
  g.appendChild(bgCircle);

  // —— Arm background: sunburst from center line outwards (linear gradient ⊥ to bisector) ——
  svg.querySelectorAll('linearGradient[id^="arm-grad-"]').forEach((el) => el.remove());
  for (let playerIdx = 0; playerIdx < layout.playerCount; playerIdx++) {
    const angleDeg = layout.playerAngles[playerIdx];
    const homeCenter = polarToXY(
      layout.trackCenterRadius + layout.armLength + layout.homeRadius,
      angleDeg
    );
    const cx = homeCenter.x;
    const cy = homeCenter.y;
    const R = layout.armBigCircleRadius;
    const armGradId = `arm-grad-${playerIdx}`;
    const midX = cx / 2;
    const midY = cy / 2;
    const perpLen = Math.hypot(cy, -cx) || 1;
    const k = (R * 2) / perpLen;
    const x1 = midX - k * cy;
    const y1 = midY + k * cx;
    const x2 = midX + k * cy;
    const y2 = midY - k * cx;
    const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    grad.id = armGradId;
    grad.setAttribute('gradientUnits', 'userSpaceOnUse');
    grad.setAttribute('x1', String(x1));
    grad.setAttribute('y1', String(y1));
    grad.setAttribute('x2', String(x2));
    grad.setAttribute('y2', String(y2));
    const fillColor = heatmapMode ? '#e5e5e5' : (layout.playerColors[playerIdx] ?? layout.playerColors[0]);
    const centerColor = heatmapMode ? '#f5f5f5' : (layout.homeCircleCenterColors[playerIdx] ?? layout.homeCircleCenterColors[0]);
    const addStop = (offset: number, colorHex: string) => {
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      s.setAttribute('offset', String(offset));
      s.setAttribute('stop-color', colorHex);
      grad.appendChild(s);
    };
    addStop(0, fillColor);
    addStop(0.42, fillColor);
    addStop(0.5, centerColor);
    addStop(0.58, fillColor);
    addStop(1, fillColor);
    defs!.appendChild(grad);
    const [T1, T2] = tangentPointsFromOrigin(cx, cy, R);
    const wedge = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    wedge.setAttribute(
      'd',
      `M 0,0 L ${T1.x},${T1.y} A ${R} ${R} 0 1 0 ${T2.x},${T2.y} L 0,0 Z`
    );
    wedge.setAttribute('fill', `url(#${armGradId})`);
    wedge.setAttribute('stroke', layout.outlineColor);
    wedge.setAttribute('stroke-width', String(layout.strokeWidth));
    wedge.setAttribute('data-player-idx', String(playerIdx));
    const playerFolded = (state.foldedThisRound ?? []).includes(playerIdx) && state.roundPhase === 'play';
    if (playerFolded) {
      wedge.setAttribute('filter', 'url(#folded-desaturate)');
    }
    g.appendChild(wedge);

    // Petal glow overlay: win (gold sparkly) or current player (white) — skip in heatmap mode
    const isWinHighlight = !heatmapMode && winningPlayerIndices && winningPlayerIndices.length > 0 && winningPlayerIndices.includes(playerIdx);
    const glowIdx = highlightPlayerIndex !== undefined ? (highlightPlayerIndex ?? -1) : (state.currentPlayerIndex ?? -1);
    const isCurrentHighlight = !heatmapMode && !isWinHighlight && highlightPlayerIndex !== null && playerIdx === glowIdx;
    const showGlow = isWinHighlight || isCurrentHighlight;

    if (showGlow) {
      if (isWinHighlight) {
        if (!svg.querySelector('#win-petal-glow')) {
          const glowFilter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
          glowFilter.id = 'win-petal-glow';
          glowFilter.setAttribute('x', '-80%');
          glowFilter.setAttribute('y', '-80%');
          glowFilter.setAttribute('width', '260%');
          glowFilter.setAttribute('height', '260%');
          const blur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
          blur.setAttribute('in', 'SourceGraphic');
          blur.setAttribute('stdDeviation', '14');
          blur.setAttribute('result', 'blur');
          glowFilter.appendChild(blur);
          const flood = document.createElementNS('http://www.w3.org/2000/svg', 'feFlood');
          flood.setAttribute('flood-color', '#ffd700');
          flood.setAttribute('flood-opacity', '0.9');
          flood.setAttribute('result', 'gold');
          glowFilter.appendChild(flood);
          const composite = document.createElementNS('http://www.w3.org/2000/svg', 'feComposite');
          composite.setAttribute('in', 'gold');
          composite.setAttribute('in2', 'blur');
          composite.setAttribute('operator', 'in');
          composite.setAttribute('result', 'glow');
          glowFilter.appendChild(composite);
          const turbulence = document.createElementNS('http://www.w3.org/2000/svg', 'feTurbulence');
          turbulence.setAttribute('type', 'fractalNoise');
          turbulence.setAttribute('baseFrequency', '0.04');
          turbulence.setAttribute('numOctaves', '2');
          turbulence.setAttribute('result', 'noise');
          const turbulenceAnim = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
          turbulenceAnim.setAttribute('attributeName', 'baseFrequency');
          turbulenceAnim.setAttribute('values', '0.04;0.06;0.04');
          turbulenceAnim.setAttribute('dur', '1.5s');
          turbulenceAnim.setAttribute('repeatCount', 'indefinite');
          turbulence.appendChild(turbulenceAnim);
          glowFilter.appendChild(turbulence);
          const displace = document.createElementNS('http://www.w3.org/2000/svg', 'feDisplacementMap');
          displace.setAttribute('in', 'glow');
          displace.setAttribute('in2', 'noise');
          displace.setAttribute('scale', '2');
          displace.setAttribute('xChannelSelector', 'R');
          displace.setAttribute('yChannelSelector', 'G');
          displace.setAttribute('result', 'sparkle');
          glowFilter.appendChild(displace);
          const merge = document.createElementNS('http://www.w3.org/2000/svg', 'feMerge');
          const n1 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
          n1.setAttribute('in', 'sparkle');
          const n2 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
          n2.setAttribute('in', 'sparkle');
          const n3 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
          n3.setAttribute('in', 'SourceGraphic');
          merge.appendChild(n1);
          merge.appendChild(n2);
          merge.appendChild(n3);
          glowFilter.appendChild(merge);
          defs!.appendChild(glowFilter);
        }
        const glowWedge = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        glowWedge.setAttribute('d', wedge.getAttribute('d')!);
        glowWedge.setAttribute('fill', fillColor);
        glowWedge.setAttribute('opacity', '1');
        glowWedge.setAttribute('stroke', '#ffd700');
        glowWedge.setAttribute('stroke-width', '40');
        glowWedge.setAttribute('stroke-opacity', '1');
        glowWedge.setAttribute('filter', 'url(#win-petal-glow)');
        glowWedge.setAttribute('pointer-events', 'none');
        const anim = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
        anim.setAttribute('attributeName', 'opacity');
        anim.setAttribute('values', '0.7;1;0.7');
        anim.setAttribute('dur', '1.2s');
        anim.setAttribute('repeatCount', 'indefinite');
        glowWedge.appendChild(anim);
        g.insertBefore(glowWedge, wedge);
      } else {
        if (!svg.querySelector('#active-petal-glow')) {
          const glowFilter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
          glowFilter.id = 'active-petal-glow';
          glowFilter.setAttribute('x', '-50%');
          glowFilter.setAttribute('y', '-50%');
          glowFilter.setAttribute('width', '200%');
          glowFilter.setAttribute('height', '200%');
          const blur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
          blur.setAttribute('in', 'SourceGraphic');
          blur.setAttribute('stdDeviation', '10');
          glowFilter.appendChild(blur);
          defs!.appendChild(glowFilter);
        }
        const glowWedge = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        glowWedge.setAttribute('d', wedge.getAttribute('d')!);
        glowWedge.setAttribute('fill', fillColor);
        glowWedge.setAttribute('opacity', '1');
        glowWedge.setAttribute('stroke', '#ffffff');
        glowWedge.setAttribute('stroke-width', '30');
        glowWedge.setAttribute('stroke-opacity', '1');
        glowWedge.setAttribute('filter', 'url(#active-petal-glow)');
        glowWedge.setAttribute('pointer-events', 'none');
        const anim = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
        anim.setAttribute('attributeName', 'opacity');
        anim.setAttribute('values', '0.5;0.95;0.5');
        anim.setAttribute('dur', '2s');
        anim.setAttribute('repeatCount', 'indefinite');
        glowWedge.appendChild(anim);
        g.insertBefore(glowWedge, wedge);
      }
    }
  }

  // —— Main circle: tiles with flower-petal shape; non-start tiles use sunburst ——
  // Scale petal radius by segment count so it stays proportional to tracks per player (narrower segments → smaller petal)
  const refCircleTiles = 4 + 4 * 14; // reference: 4 players, 14 tracks per player
  const petalR = layout.trackPetalRadius * (refCircleTiles / Math.max(1, circleTiles));
  const trackGradR = 45;
  svg.querySelectorAll('radialGradient[id^="track-grad-"]').forEach((el) => el.remove());
  for (let i = 0; i < circleTiles; i++) {
    const center = circleSegmentCenterAngleDeg(i, layout);
    const a0 = center - angleStep / 2;
    const a1 = center + angleStep / 2;
    const p1 = polarToXY(rIn, a0);
    const p4 = polarToXY(rIn, a1);
    const petalCenter = polarToXY(rOut, center);
    const P0 = rayCircleOuterIntersection(petalCenter.x, petalCenter.y, petalR, a0);
    const P1 = rayCircleOuterIntersection(petalCenter.x, petalCenter.y, petalR, a1);
    let pathD: string;
    if (P0 && P1) {
      pathD = `M ${p1.x},${p1.y} ${arcSegment(rIn, a0, a1)} L ${P1.x},${P1.y} A ${petalR} ${petalR} 0 0 1 ${P0.x},${P0.y} L ${p1.x},${p1.y} Z`;
    } else {
      const p2 = polarToXY(rOut, a0);
      const p3 = polarToXY(rOut, a1);
      pathD = `M ${p1.x},${p1.y} L ${p2.x},${p2.y} A ${rOut} ${rOut} 0 0 1 ${p3.x},${p3.y} L ${p4.x},${p4.y} ${arcSegment(rIn, a1, a0)} Z`;
    }
    const segment = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    segment.setAttribute('d', pathD);
    const isStart = startCircleIndices.includes(i);
    if (isStart && !heatmapSegmentCounts) {
      segment.setAttribute('fill', heatmapMode ? '#e8e8e8' : 'none');
      segment.setAttribute('stroke', heatmapMode ? layout.outlineColor : 'none');
      if (heatmapMode) segment.setAttribute('stroke-width', String(layout.strokeWidth));
    } else if (isStart && heatmapSegmentCounts && heatmapSegmentCounts.length > i) {
      const maxCount = Math.max(1, ...heatmapSegmentCounts);
      const raw = heatmapSegmentCounts[i] / maxCount;
      const t = raw > 0 ? 0.04 + 0.96 * Math.sqrt(raw) : 0.04;
      segment.setAttribute('fill', magmaColor(t));
      segment.setAttribute('stroke', layout.outlineColor);
      segment.setAttribute('stroke-width', String(layout.strokeWidth));
    } else if (!isStart) {
      let fillColor: string;
      if (heatmapSegmentCounts && heatmapSegmentCounts.length > i) {
        const maxCount = Math.max(1, ...heatmapSegmentCounts);
        const raw = heatmapSegmentCounts[i] / maxCount;
        const t = raw > 0 ? 0.04 + 0.96 * Math.sqrt(raw) : 0.04;
        fillColor = magmaColor(t);
      } else if (heatmapMode) {
        fillColor = '#e5e5e5';
      } else {
        const segPlayerIdx = trackSegmentPlayerIndex(i, layout);
        const trackGradId = `track-grad-${i}`;
        const grad = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
        grad.id = trackGradId;
        grad.setAttribute('gradientUnits', 'userSpaceOnUse');
        grad.setAttribute('cx', String(petalCenter.x));
        grad.setAttribute('cy', String(petalCenter.y));
        grad.setAttribute('r', String(trackGradR));
        const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop1.setAttribute('offset', '0');
        stop1.setAttribute('stop-color', layout.homeCircleCenterColors[segPlayerIdx]);
        const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop2.setAttribute('offset', '1');
        stop2.setAttribute('stop-color', layout.playerColors[segPlayerIdx]);
        grad.appendChild(stop1);
        grad.appendChild(stop2);
        defs!.appendChild(grad);
        fillColor = `url(#${trackGradId})`;
      }
      segment.setAttribute('fill', fillColor);
      segment.setAttribute('stroke', layout.outlineColor);
      segment.setAttribute('stroke-width', String(layout.strokeWidth));
    }
    g.appendChild(segment);
  }

  if (layout.debugTrackLabels) {
    const midR = (rIn + rOut) / 2;
    for (let i = 0; i < circleTiles; i++) {
      const angleDeg = circleSegmentCenterAngleDeg(i, layout);
      const pos = polarToXY(midR, angleDeg);
      const isStart = startCircleIndices.includes(i);
      const startLabel =
        layout.playerColorNames?.[startCircleIndices.indexOf(i)] ?? String(startCircleIndices.indexOf(i));
      const trackPos = trackSegmentsOrdered.indexOf(i);
      const label = isStart ? `S ${startLabel}` : trackPos >= 0 ? `T${trackPos}` : String(i);
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(pos.x));
      text.setAttribute('y', String(pos.y));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('font-size', '9');
      text.setAttribute('font-weight', 'bold');
      text.setAttribute('fill', '#fff');
      text.setAttribute('stroke', layout.outlineColor);
      text.setAttribute('stroke-width', '0.6');
      text.setAttribute('pointer-events', 'none');
      text.textContent = label;
      g.appendChild(text);
    }
  }

  const sunburstR = rOut + 60;
  const sunburstCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  sunburstCircle.setAttribute('cx', '0');
  sunburstCircle.setAttribute('cy', '0');
  sunburstCircle.setAttribute('r', String(sunburstR));
  sunburstCircle.setAttribute('fill', 'url(#sunburst)');
  sunburstCircle.setAttribute('pointer-events', 'none');
  g.appendChild(sunburstCircle);

  // —— Per-player: home circle + home spots + end zones (all layout players) ——
  svg.querySelectorAll('radialGradient[id^="home-grad-"]').forEach((el) => el.remove());
  svg.querySelectorAll('radialGradient[id^="home-spot-grad-"]').forEach((el) => el.remove());
  svg.querySelectorAll('radialGradient[id^="end-grad-"]').forEach((el) => el.remove());
  for (let playerIdx = 0; playerIdx < layout.playerCount; playerIdx++) {
    const angleDeg = layout.playerAngles[playerIdx];
    const homeCenter = polarToXY(
      layout.trackCenterRadius + layout.armLength + layout.homeRadius,
      angleDeg
    );
    const fillColor = heatmapMode ? '#e5e5e5' : (layout.playerColors[playerIdx] ?? layout.playerColors[0]);
    const centerColor = heatmapMode ? '#f5f5f5' : (layout.homeCircleCenterColors[playerIdx] ?? layout.homeCircleCenterColors[0]);
    const gradId = `home-grad-${playerIdx}`;
    const grad = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
    grad.id = gradId;
    grad.setAttribute('gradientUnits', 'userSpaceOnUse');
    grad.setAttribute('cx', String(homeCenter.x));
    grad.setAttribute('cy', String(homeCenter.y));
    grad.setAttribute('r', String(layout.homeCircleRadius));
    const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop1.setAttribute('offset', '0');
    stop1.setAttribute('stop-color', centerColor);
    const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop2.setAttribute('offset', String(layout.homeSunburstExtent));
    stop2.setAttribute('stop-color', centerColor);
    const stop3 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop3.setAttribute('offset', '1');
    stop3.setAttribute('stop-color', fillColor);
    grad.appendChild(stop1);
    grad.appendChild(stop2);
    grad.appendChild(stop3);
    defs!.appendChild(grad);
    const homeBg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    homeBg.setAttribute('cx', String(homeCenter.x));
    homeBg.setAttribute('cy', String(homeCenter.y));
    homeBg.setAttribute('r', String(layout.homeCircleRadius));
    homeBg.setAttribute('fill', `url(#${gradId})`);
    homeBg.setAttribute('stroke', layout.outlineColor);
    homeBg.setAttribute('stroke-width', String(layout.strokeWidth));
    const playerFolded = (state.foldedThisRound ?? []).includes(playerIdx) && state.roundPhase === 'play';
    if (playerFolded) {
      homeBg.setAttribute('filter', 'url(#folded-desaturate)');
    }
    g.appendChild(homeBg);

    const spotColor = heatmapMode ? '#d4d4d4' : (layout.homeSpotFillColors[playerIdx] ?? layout.homeSpotFillColors[0]);
    for (let k = 0; k < layout.pawnsPerPlayer; k++) {
      const pos = playerSlotToXY(playerIdx, 'H', k, layout);
      const homeSpotGradId = `home-spot-grad-${playerIdx}-${k}`;
      const spotGrad = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
      spotGrad.id = homeSpotGradId;
      spotGrad.setAttribute('gradientUnits', 'userSpaceOnUse');
      spotGrad.setAttribute('cx', String(pos.x));
      spotGrad.setAttribute('cy', String(pos.y));
      spotGrad.setAttribute('r', String(layout.homeSpotRadius));
      const s1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      s1.setAttribute('offset', '0');
      s1.setAttribute('stop-color', spotColor);
      const s2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      s2.setAttribute('offset', '0.85');
      s2.setAttribute('stop-color', spotColor);
      const s3 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      s3.setAttribute('offset', '1');
      s3.setAttribute('stop-color', fillColor);
      spotGrad.appendChild(s1);
      spotGrad.appendChild(s2);
      spotGrad.appendChild(s3);
      defs!.appendChild(spotGrad);
      const hc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      hc.setAttribute('cx', String(pos.x));
      hc.setAttribute('cy', String(pos.y));
      hc.setAttribute('r', String(layout.homeSpotRadius));
      hc.setAttribute('fill', `url(#${homeSpotGradId})`);
      if (playerFolded) {
        hc.setAttribute('filter', 'url(#folded-desaturate)');
      }
      g.appendChild(hc);
    }

    for (let k = 0; k < layout.endZoneSlots; k++) {
      const pos = playerSlotToXY(playerIdx, 'E', k, layout);
      const r = layout.endSpotRadii[k] ?? layout.endSpotRadii[0];
      const endGradId = `end-grad-${playerIdx}-${k}`;
      const eg = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
      eg.id = endGradId;
      eg.setAttribute('gradientUnits', 'userSpaceOnUse');
      eg.setAttribute('cx', String(pos.x));
      eg.setAttribute('cy', String(pos.y));
      eg.setAttribute('r', String(r));
      const es1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      es1.setAttribute('offset', '0');
      es1.setAttribute('stop-color', centerColor);
      const es2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      es2.setAttribute('offset', '1');
      es2.setAttribute('stop-color', fillColor);
      eg.appendChild(es1);
      eg.appendChild(es2);
      defs!.appendChild(eg);
      const ec = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ec.setAttribute('cx', String(pos.x));
      ec.setAttribute('cy', String(pos.y));
      ec.setAttribute('r', String(r));
      ec.setAttribute('fill', `url(#${endGradId})`);
      ec.setAttribute('stroke', layout.outlineColor);
      ec.setAttribute('stroke-width', String(layout.strokeWidth));
      if (playerFolded) {
        ec.setAttribute('filter', 'url(#folded-desaturate)');
      }
      g.appendChild(ec);
    }
  }

  if (state.dealerIndex != null && state.dealerIndex < layout.playerCount) {
    const di = state.dealerIndex;
    const dAngle = layout.playerAngles[di];
    const dPos = polarToXY(
      layout.trackCenterRadius + layout.armLength + layout.homeRadius + layout.homeCircleRadius + 14,
      dAngle,
    );
    const dBadge = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dBadge.setAttribute('cx', String(dPos.x));
    dBadge.setAttribute('cy', String(dPos.y));
    dBadge.setAttribute('r', '10');
    dBadge.setAttribute('fill', '#fff');
    dBadge.setAttribute('stroke', '#333');
    dBadge.setAttribute('stroke-width', '1.5');
    g.appendChild(dBadge);
    const dText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    dText.setAttribute('x', String(dPos.x));
    dText.setAttribute('y', String(dPos.y));
    dText.setAttribute('text-anchor', 'middle');
    dText.setAttribute('dominant-baseline', 'central');
    dText.setAttribute('font-size', '11');
    dText.setAttribute('font-weight', 'bold');
    dText.setAttribute('fill', '#333');
    dText.setAttribute('pointer-events', 'none');
    dText.textContent = 'D';
    g.appendChild(dText);
  }

  const CENTER_R = 100;
  const centerBg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  centerBg.setAttribute('cx', '0');
  centerBg.setAttribute('cy', '0');
  centerBg.setAttribute('r', String(CENTER_R));
  centerBg.setAttribute('fill', darkenHex(layout.boardBgColorInner, 0.35));
  centerBg.setAttribute('stroke', layout.outlineColor);
  centerBg.setAttribute('stroke-width', String(layout.strokeWidth));
  g.appendChild(centerBg);

  const occupancy = getOccupancy(state.movers);
  const centerTolerance = 5;
  state.movers.forEach((mover) => {
    const override = moverPositionOverrides?.[mover.id];
    const pos = override ?? nodeIdToXY(mover.pos, board, layout);
    const onNode = occupancy.get(mover.pos) ?? [];
    const idx = onNode.findIndex((x) => x.id === mover.id);
    const offset = onNode.length > 1 ? (idx - (onNode.length - 1) / 2) * 10 : 0;
    const p = parseNodeId(mover.pos);
    const angle =
      p?.kind === 'T'
        ? angleForTrackIndex(p.index, board, layout)
        : p?.kind === 'S'
          ? angleForCircleSegment(getStartCircleIndexForColor(p.color, layout), layout)
          : 0;
    const perpX = -Math.sin(angle) * offset;
    const perpY = Math.cos(angle) * offset;
    const cx = pos.x + perpX;
    const cy = pos.y + perpY;
    if (Math.abs(cx) < centerTolerance && Math.abs(cy) < centerTolerance) return;

    const pawnGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    pawnGroup.setAttribute('data-mover-id', mover.id);
    pawnGroup.classList.add('pawn');

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(cx));
    circle.setAttribute('cy', String(cy));
    circle.setAttribute('r', String(layout.moverRadius));
    circle.setAttribute('fill', getColorFill(mover.color, layout));
    circle.setAttribute('stroke', layout.outlineColor);
    circle.setAttribute('stroke-width', String(layout.strokeWidth));
    circle.setAttribute('filter', 'url(#pawn-shadow)');
    pawnGroup.appendChild(circle);

    const pawnIndex = mover.id.split('_').pop() ?? '0';
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String(cx));
    label.setAttribute('y', String(cy));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dominant-baseline', 'central');
    label.setAttribute('font-size', String(layout.moverRadius * 1.5));
    label.setAttribute('font-weight', 'bold');
    label.setAttribute('fill', '#fff');
    label.setAttribute('stroke', '#000');
    label.setAttribute('stroke-width', '0.75');
    label.setAttribute('pointer-events', 'none');
    label.textContent = String(Number(pawnIndex) + 1);
    pawnGroup.appendChild(label);

    g.appendChild(pawnGroup);
  });

  if (!svg.querySelector('#pawn-shadow')) {
    const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter.id = 'pawn-shadow';
    filter.setAttribute('x', '-50%');
    filter.setAttribute('y', '-50%');
    filter.setAttribute('width', '200%');
    filter.setAttribute('height', '200%');
    const fe = document.createElementNS('http://www.w3.org/2000/svg', 'feDropShadow');
    fe.setAttribute('dx', '0');
    fe.setAttribute('dy', '1');
    fe.setAttribute('stdDeviation', '1.5');
    fe.setAttribute('flood-color', '#000');
    fe.setAttribute('flood-opacity', '0.35');
    filter.appendChild(fe);
    defs.appendChild(filter);
  }
  if (!svg.querySelector('#pawn-highlight-glow')) {
    const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter.id = 'pawn-highlight-glow';
    filter.setAttribute('x', '-80%');
    filter.setAttribute('y', '-80%');
    filter.setAttribute('width', '260%');
    filter.setAttribute('height', '260%');
    const blur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
    blur.setAttribute('in', 'SourceGraphic');
    blur.setAttribute('stdDeviation', '4');
    blur.setAttribute('result', 'blur');
    const merge = document.createElementNS('http://www.w3.org/2000/svg', 'feMerge');
    const n1 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
    n1.setAttribute('in', 'blur');
    const n2 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
    n2.setAttribute('in', 'blur');
    const n3 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
    n3.setAttribute('in', 'SourceGraphic');
    merge.appendChild(n1);
    merge.appendChild(n2);
    merge.appendChild(n3);
    filter.appendChild(blur);
    filter.appendChild(merge);
    defs.appendChild(filter);
  }
  if (!svg.querySelector('#sunburst')) {
    const grad = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
    grad.id = 'sunburst';
    grad.setAttribute('gradientUnits', 'userSpaceOnUse');
    grad.setAttribute('cx', '0');
    grad.setAttribute('cy', '0');
    grad.setAttribute('r', String(layout.trackCenterRadius));
    const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop1.setAttribute('offset', '0');
    stop1.setAttribute('stop-color', '#fff');
    stop1.setAttribute('stop-opacity', '0.07');
    const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop2.setAttribute('offset', '0.45');
    stop2.setAttribute('stop-color', '#fff');
    stop2.setAttribute('stop-opacity', '0.02');
    const stop3 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop3.setAttribute('offset', '1');
    stop3.setAttribute('stop-color', '#fff');
    stop3.setAttribute('stop-opacity', '0');
    grad.appendChild(stop1);
    grad.appendChild(stop2);
    grad.appendChild(stop3);
    defs.appendChild(grad);
  }

  const old = svg.getElementById('board-root');
  if (old) old.remove();
  svg.appendChild(g);
}

/** Card color for SVG mini-cards in center. */
function cardAccentColor(card: { type: string; value?: number }): string {
  switch (card.type) {
    case 'NUMBER': return '#c0392b';
    case 'START': case 'START_OR_8': case 'START_OR_13': return '#27ae60';
    case 'FOUR_BACK': return '#e67e22';
    case 'ONE_OR_14': return '#8e44ad';
    case 'SEVEN_SPLIT': return '#16a085';
    case 'SWAP': return '#2980b9';
    default: return '#95a5a6';
  }
}

export function cardShortLabel(card: { type: string; value?: number }): string {
  if (card.type === 'NUMBER') return String(card.value ?? '?');
  if (card.type === 'START') return '\u2665';
  if (card.type === 'START_OR_8') return '\u2665/8';
  if (card.type === 'START_OR_13') return '\u2665/13';
  if (card.type === 'FOUR_BACK') return '-4';
  if (card.type === 'ONE_OR_14') return '1/14';
  if (card.type === 'SEVEN_SPLIT') return '7';
  if (card.type === 'SWAP') return '\u21D4';
  return '?';
}

export interface CenterCard {
  card: { type: string; value?: number };
  playerColor: string;
  usedValue?: 'start' | number;
}

/** Derive which value of a dual-value card was actually used from the action. */
export function getUsedValue(
  card: { type: string; value?: number } | null,
  action: Action | 'fold' | 'exchange',
): 'start' | number | undefined {
  if (!card || typeof action === 'string') return undefined;
  if (card.type === 'START_OR_8') return action.kind === 'start' ? 'start' : 8;
  if (card.type === 'START_OR_13') return action.kind === 'start' ? 'start' : 13;
  if (card.type === 'ONE_OR_14' && action.kind === 'one_or_14') return action.steps;
  return undefined;
}

/** Map a usedValue to the label fragment it matches ('start' -> heart icon, number -> digit string). */
function usedValueLabel(uv: 'start' | number): string {
  return uv === 'start' ? '\u2665' : String(uv);
}

const SWAP_ICON_PATHS = [
  'M440.448,87.831H114.629l52.495-52.495c8.084-8.084,8.084-21.19,0-29.274c-8.083-8.084-21.19-8.084-29.274,0L20.126,123.788c-8.084,8.084-8.084,21.19,0,29.274L137.85,270.786c4.041,4.042,9.338,6.062,14.636,6.062c5.298,0,10.596-2.02,14.636-6.064c8.084-8.084,8.084-21.19,0-29.274l-52.495-52.495h325.82c27.896,0,50.592-22.695,50.592-50.592C491.04,110.528,468.345,87.831,440.448,87.831z',
  'M491.877,358.942L374.154,241.218c-8.083-8.084-21.19-8.084-29.274,0c-8.084,8.084-8.084,21.19,0,29.274l52.495,52.495H71.556c-27.896,0-50.592,22.695-50.592,50.592s22.695,50.593,50.592,50.593h325.819l-52.495,52.495c-8.084,8.084-8.084,21.19,0,29.274c4.042,4.042,9.34,6.064,14.636,6.064c5.296,0,10.596-2.02,14.636-6.064l117.724-117.724C499.961,380.132,499.961,367.026,491.877,358.942z',
];

function ensureSwapIconDef(svg: SVGSVGElement): void {
  if (svg.querySelector('#swap-icon')) return;
  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }
  const symbol = document.createElementNS('http://www.w3.org/2000/svg', 'symbol');
  symbol.id = 'swap-icon';
  symbol.setAttribute('viewBox', '0 0 512.003 512.003');
  SWAP_ICON_PATHS.forEach((d) => {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    symbol.appendChild(p);
  });
  defs.appendChild(symbol);
}

/** Render played cards as a stacked pile in the board center (left side). */
export function renderCenterCards(svg: SVGSVGElement, cards: CenterCard[]): void {
  const old = svg.querySelector('#center-cards');
  if (old) old.remove();
  if (cards.length === 0) return;

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.id = 'center-cards';

  const W = 57, H = 78;
  const PILE_OFFSET = 4;
  const MAX_VISIBLE = 5;
  const CENTER_MARGIN = 10;
  const PILE_CX = -36 - CENTER_MARGIN / 2;
  const PILE_CY = 0;

  const visibleCount = Math.min(cards.length, MAX_VISIBLE);
  const startIdx = cards.length - visibleCount;

  for (let vi = 0; vi < visibleCount; vi++) {
    const entry = cards[startIdx + vi];
    const isTop = vi === visibleCount - 1;
    const depthFromTop = visibleCount - 1 - vi;
    const ox = PILE_CX - W / 2 + depthFromTop * PILE_OFFSET;
    const oy = PILE_CY - H / 2 - depthFromTop * PILE_OFFSET;
    const opacity = isTop ? 1 : 0.25 + 0.15 * vi;

    const cardG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    cardG.setAttribute('opacity', String(opacity));

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(ox));
    rect.setAttribute('y', String(oy));
    rect.setAttribute('width', String(W));
    rect.setAttribute('height', String(H));
    rect.setAttribute('rx', '4');
    rect.setAttribute('fill', '#fffef9');
    rect.setAttribute('stroke', entry.playerColor);
    rect.setAttribute('stroke-width', '4');
    cardG.appendChild(rect);

    if (isTop) {
      const cx = ox + W / 2;
      const cy = oy + H / 2;
      const label = cardShortLabel(entry.card);
      const parts = label.includes('/') ? label.split('/') : [label];
      const uvLabel = entry.usedValue != null ? usedValueLabel(entry.usedValue) : null;

      if (parts.length === 2) {
        const lineHeight = 15;
        parts.forEach((part, j) => {
          const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          text.setAttribute('x', String(cx));
          text.setAttribute('y', String(cy + (j === 0 ? -lineHeight : lineHeight)));
          text.setAttribute('text-anchor', 'middle');
          text.setAttribute('dominant-baseline', 'central');
          text.setAttribute('font-size', '21');
          text.setAttribute('pointer-events', 'none');
          const isUsed = uvLabel == null || part === uvLabel;
          text.setAttribute('font-weight', isUsed ? 'bold' : 'normal');
          text.setAttribute('fill', isUsed ? '#2c3e50' : '#aab2bd');
          text.setAttribute('opacity', isUsed ? '1' : '0.5');
          text.textContent = part;
          cardG.appendChild(text);
        });
      } else if (entry.card?.type === 'SWAP') {
        ensureSwapIconDef(svg);
        const iconSize = 36;
        const useEl = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        useEl.setAttributeNS('http://www.w3.org/1999/xlink', 'href', '#swap-icon');
        useEl.setAttribute('x', String(cx - iconSize / 2));
        useEl.setAttribute('y', String(cy - iconSize / 2 + 8));
        useEl.setAttribute('width', String(iconSize));
        useEl.setAttribute('height', String(iconSize));
        useEl.setAttribute('fill', '#2c3e50');
        useEl.setAttribute('pointer-events', 'none');
        cardG.appendChild(useEl);
      } else {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', String(cx));
        text.setAttribute('y', String(cy + 8));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'central');
        text.setAttribute('font-size', '24');
        text.setAttribute('font-weight', 'bold');
        text.setAttribute('fill', '#2c3e50');
        text.setAttribute('pointer-events', 'none');
        text.textContent = label;
        cardG.appendChild(text);
      }
    }

    g.appendChild(cardG);
  }

  if (cards.length > 1) {
    const badgeX = PILE_CX + W / 2 + 5;
    const badgeY = PILE_CY - H / 2 - 5;
    const badgeR = cards.length > 99 ? 12 : 10;
    const badge = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    badge.setAttribute('cx', String(badgeX));
    badge.setAttribute('cy', String(badgeY));
    badge.setAttribute('r', String(badgeR));
    badge.setAttribute('fill', '#e74c3c');
    badge.setAttribute('stroke', '#fff');
    badge.setAttribute('stroke-width', '1');
    g.appendChild(badge);
    const badgeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    badgeText.setAttribute('x', String(badgeX));
    badgeText.setAttribute('y', String(badgeY));
    badgeText.setAttribute('text-anchor', 'middle');
    badgeText.setAttribute('dominant-baseline', 'central');
    badgeText.setAttribute('font-size', cards.length > 99 ? '10' : '11');
    badgeText.setAttribute('font-weight', 'bold');
    badgeText.setAttribute('fill', '#fff');
    badgeText.setAttribute('stroke', '#000');
    badgeText.setAttribute('stroke-width', '1');
    badgeText.setAttribute('paint-order', 'stroke fill');
    badgeText.setAttribute('pointer-events', 'none');
    badgeText.textContent = String(cards.length);
    g.appendChild(badgeText);
  }

  const root = svg.querySelector('#board-root');
  if (root) root.appendChild(g);
}

const CENTER_MARGIN = 10;

/** Deck center position (for deal animation). */
export function getDeckCenter(): { x: number; y: number } {
  return { x: 24 + CENTER_MARGIN / 2, y: 0 };
}

/** Center pile top card position (for card-to-center animation). */
export function getCenterPilePosition(): { x: number; y: number } {
  return { x: -36 - CENTER_MARGIN / 2, y: 0 };
}

/** Hand card center position for a given player and slot (fixed 4 slots per player). */
export function getHandCardPosition(
  layout: BoardLayoutConfig,
  playerIdx: number,
  cardSlot: number,
  _totalInHand?: number
): { x: number; y: number } {
  const W = HAND_CARD_W;
  const GAP = HAND_CARD_GAP;
  const handDist =
    layout.trackCenterRadius +
    layout.armLength +
    layout.homeRadius +
    layout.homeCircleRadius +
    100;
  const angleDeg = layout.playerAngles[playerIdx];
  const handCenter = polarToXY(handDist, angleDeg);
  const totalWidth = HAND_SLOTS * W + (HAND_SLOTS - 1) * GAP;
  const offsetX = -totalWidth / 2 + W / 2 + cardSlot * (W + GAP);
  return { x: handCenter.x + offsetX, y: handCenter.y };
}

/** Card dimensions (same as player hand cards). */
const HAND_CARD_W = 57;
const HAND_CARD_H = 78;

/** Render the undealt deck as a face-down card with a count badge (right side of center). */
export function renderDeck(svg: SVGSVGElement, deckSize: number): void {
  const old = svg.querySelector('#center-deck');
  if (old) old.remove();

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.id = 'center-deck';

  const W = HAND_CARD_W, H = HAND_CARD_H;
  const DECK_CX = 24 + CENTER_MARGIN / 2;
  const DECK_CY = 0;
  const x = DECK_CX - W / 2;
  const y = DECK_CY - H / 2;

  if (deckSize > 2) {
    const shadow = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    shadow.setAttribute('x', String(x + 3));
    shadow.setAttribute('y', String(y - 3));
    shadow.setAttribute('width', String(W));
    shadow.setAttribute('height', String(H));
    shadow.setAttribute('rx', '4');
    shadow.setAttribute('fill', '#1a252f');
    shadow.setAttribute('stroke', '#4a6785');
    shadow.setAttribute('stroke-width', '1');
    shadow.setAttribute('opacity', '0.5');
    g.appendChild(shadow);
  }
  if (deckSize > 0) {
    const back = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    back.setAttribute('x', String(x));
    back.setAttribute('y', String(y));
    back.setAttribute('width', String(W));
    back.setAttribute('height', String(H));
    back.setAttribute('rx', '4');
    back.setAttribute('fill', '#2c3e50');
    back.setAttribute('stroke', '#4a6785');
    back.setAttribute('stroke-width', '3');
    g.appendChild(back);

    const inner = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    inner.setAttribute('x', String(x + 5));
    inner.setAttribute('y', String(y + 5));
    inner.setAttribute('width', String(W - 10));
    inner.setAttribute('height', String(H - 10));
    inner.setAttribute('rx', '3');
    inner.setAttribute('fill', 'none');
    inner.setAttribute('stroke', '#4a6785');
    inner.setAttribute('stroke-width', '0.8');
    g.appendChild(inner);
  }

  const badgeR = deckSize > 99 ? 11 : 9;
  const badge = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  badge.setAttribute('cx', String(DECK_CX));
  badge.setAttribute('cy', String(DECK_CY));
  badge.setAttribute('r', String(badgeR));
  badge.setAttribute('fill', deckSize > 0 ? '#f39c12' : '#7f8c8d');
  badge.setAttribute('stroke', '#fff');
  badge.setAttribute('stroke-width', '1.5');
  g.appendChild(badge);
  const countText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  countText.setAttribute('x', String(DECK_CX));
  countText.setAttribute('y', String(DECK_CY));
  countText.setAttribute('text-anchor', 'middle');
  countText.setAttribute('dominant-baseline', 'central');
  countText.setAttribute('font-size', deckSize > 99 ? '9' : '11');
  countText.setAttribute('font-weight', 'bold');
  countText.setAttribute('fill', '#fff');
  countText.setAttribute('stroke', '#000');
  countText.setAttribute('stroke-width', '1');
  countText.setAttribute('paint-order', 'stroke fill');
  countText.setAttribute('pointer-events', 'none');
  countText.textContent = String(deckSize);
  g.appendChild(countText);

  const root = svg.querySelector('#board-root');
  if (root) root.appendChild(g);
}

const HAND_CARD_GAP = 9;
/** Fixed number of card slots per player (cards fill left-to-right). */
const HAND_SLOTS = 4;

/** Appends an empty card slot (outline only) to a parent group. */
function appendEmptySlotToGroup(parent: SVGGElement, cx: number, cy: number, strokeColor: string): void {
  const W = HAND_CARD_W;
  const H = HAND_CARD_H;
  const x = cx - W / 2;
  const y = cy - H / 2;
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', String(x));
  rect.setAttribute('y', String(y));
  rect.setAttribute('width', String(W));
  rect.setAttribute('height', String(H));
  rect.setAttribute('rx', '4');
  rect.setAttribute('fill', 'none');
  rect.setAttribute('stroke', strokeColor);
  rect.setAttribute('stroke-width', '3');
  rect.setAttribute('stroke-dasharray', '4 4');
  rect.setAttribute('opacity', '0.5');
  parent.appendChild(rect);
}

/** Appends a single hand card (rect + label/icon) to a parent group. */
function appendHandCardToGroup(
  parent: SVGGElement,
  svg: SVGSVGElement,
  card: Card,
  cx: number,
  cy: number,
  borderColor: string
): void {
  const W = HAND_CARD_W;
  const H = HAND_CARD_H;
  const x = cx - W / 2;
  const y = cy - H / 2;

  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', String(x));
  rect.setAttribute('y', String(y));
  rect.setAttribute('width', String(W));
  rect.setAttribute('height', String(H));
  rect.setAttribute('rx', '4');
  rect.setAttribute('fill', '#fffef9');
  rect.setAttribute('stroke', borderColor);
  rect.setAttribute('stroke-width', '4');
  parent.appendChild(rect);

  const label = cardShortLabel(card);
  const parts = label.includes('/') ? label.split('/') : [label];
  if (parts.length === 2) {
    const lineHeight = 15;
    parts.forEach((part, j) => {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(cx));
      text.setAttribute('y', String(cy + (j === 0 ? -lineHeight : lineHeight)));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.setAttribute('font-size', '21');
      text.setAttribute('font-weight', 'bold');
      text.setAttribute('fill', '#2c3e50');
      text.textContent = part;
      parent.appendChild(text);
    });
  } else if (card.type === 'SWAP') {
    ensureSwapIconDef(svg);
    const iconSize = 36;
    const useEl = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    useEl.setAttributeNS('http://www.w3.org/1999/xlink', 'href', '#swap-icon');
    useEl.setAttribute('x', String(cx - iconSize / 2));
    useEl.setAttribute('y', String(cy - iconSize / 2 + 8));
    useEl.setAttribute('width', String(iconSize));
    useEl.setAttribute('height', String(iconSize));
    useEl.setAttribute('fill', '#2c3e50');
    parent.appendChild(useEl);
  } else {
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', String(cx));
    text.setAttribute('y', String(cy + 8));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.setAttribute('font-size', '24');
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('fill', '#2c3e50');
    text.textContent = label;
    parent.appendChild(text);
  }
}

export interface FlyingCard {
  card: Card;
  from: { x: number; y: number };
  to: { x: number; y: number };
  t: number;
  playerColor: string;
}

/** Render partial hands plus optional flying card(s) (for deal and exchange animations). */
export function renderPlayerHandsWithFlyingCard(
  svg: SVGSVGElement,
  partialHands: (Card | null | undefined)[][],
  layoutConfig: BoardLayoutConfig,
  flyingCard?: FlyingCard | FlyingCard[] | null
): void {
  const oldHands = svg.querySelector('#player-hands');
  if (oldHands) oldHands.remove();
  const oldFlying = svg.querySelector('#flying-cards');
  if (oldFlying) oldFlying.remove();

  const layout = layoutConfig;
  const W = HAND_CARD_W;
  const H = HAND_CARD_H;
  const GAP = HAND_CARD_GAP;
  const handDist =
    layout.trackCenterRadius +
    layout.armLength +
    layout.homeRadius +
    layout.homeCircleRadius +
    100;

  const handsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  handsGroup.id = 'player-hands';
  handsGroup.setAttribute('pointer-events', 'none');

  for (let playerIdx = 0; playerIdx < layout.playerCount; playerIdx++) {
    const hand = partialHands[playerIdx] ?? [];
    const angleDeg = layout.playerAngles[playerIdx];
    const handCenter = polarToXY(handDist, angleDeg);
    const playerColor = layout.playerColors[playerIdx] ?? layout.playerColors[0];

    const playerHandGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    playerHandGroup.setAttribute('data-player-idx', String(playerIdx));

    const totalWidth = HAND_SLOTS * W + (HAND_SLOTS - 1) * GAP;
    for (let i = 0; i < HAND_SLOTS; i++) {
      const offsetX = -totalWidth / 2 + W / 2 + i * (W + GAP);
      const cx = handCenter.x + offsetX;
      const cy = handCenter.y;
      const card = hand[i];
      if (card != null) {
        const borderColor = (card as { originalOwner?: number }).originalOwner != null
          ? (layout.playerColors[(card as { originalOwner?: number }).originalOwner!] ?? playerColor)
          : playerColor;
        appendHandCardToGroup(playerHandGroup, svg, card, cx, cy, borderColor);
      } else {
        appendEmptySlotToGroup(playerHandGroup, cx, cy, playerColor);
      }
    }

    handsGroup.appendChild(playerHandGroup);
  }

  const root = svg.querySelector('#board-root');
  if (root) {
    root.appendChild(handsGroup);

    const cards = flyingCard == null ? [] : Array.isArray(flyingCard) ? flyingCard : [flyingCard];
    if (cards.length > 0) {
      const flyingContainer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      flyingContainer.id = 'flying-cards';
      flyingContainer.setAttribute('pointer-events', 'none');
      for (const fc of cards) {
        const { card, from, to, t, playerColor } = fc;
        const cx = from.x + (to.x - from.x) * t;
        const cy = from.y + (to.y - from.y) * t;
        const flyingGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        appendHandCardToGroup(flyingGroup, svg, card, cx, cy, playerColor);
        flyingContainer.appendChild(flyingGroup);
      }
      root.appendChild(flyingContainer);
    }
  }
}

/** Render each player's hand near their home area (for simulation replay). */
export function renderPlayerHandsOnBoard(
  svg: SVGSVGElement,
  state: GameState,
  layoutConfig: BoardLayoutConfig
): void {
  const old = svg.querySelector('#player-hands');
  if (old) old.remove();

  const hands = state.hands;
  if (!hands || hands.length === 0) return;

  const layout = layoutConfig;
  const W = HAND_CARD_W;
  const H = HAND_CARD_H;
  const GAP = HAND_CARD_GAP;
  const handDist =
    layout.trackCenterRadius +
    layout.armLength +
    layout.homeRadius +
    layout.homeCircleRadius +
    100;

  const handsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  handsGroup.id = 'player-hands';
  handsGroup.setAttribute('pointer-events', 'none');

  for (let playerIdx = 0; playerIdx < layout.playerCount; playerIdx++) {
    const hand = hands[playerIdx] ?? [];
    const angleDeg = layout.playerAngles[playerIdx];
    const handCenter = polarToXY(handDist, angleDeg);
    const playerColor = layout.playerColors[playerIdx] ?? layout.playerColors[0];

    const playerHandGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    playerHandGroup.setAttribute('data-player-idx', String(playerIdx));

    const totalWidth = HAND_SLOTS * W + (HAND_SLOTS - 1) * GAP;
    for (let i = 0; i < HAND_SLOTS; i++) {
      const offsetX = -totalWidth / 2 + W / 2 + i * (W + GAP);
      const cx = handCenter.x + offsetX;
      const cy = handCenter.y;
      if (i < hand.length) {
        const card = hand[i];
        const borderColor = (card as { originalOwner?: number }).originalOwner != null
          ? (layout.playerColors[(card as { originalOwner?: number }).originalOwner!] ?? playerColor)
          : playerColor;
        appendHandCardToGroup(playerHandGroup, svg, card, cx, cy, borderColor);
      } else {
        appendEmptySlotToGroup(playerHandGroup, cx, cy, playerColor);
      }
    }

    handsGroup.appendChild(playerHandGroup);
  }

  const root = svg.querySelector('#board-root');
  if (root) root.appendChild(handsGroup);
}

/** Highlight specific pawns on the board with white glow (rendered below pawn). */
export function highlightPawns(svg: SVGSVGElement, moverIds: string[]): void {
  clearPawnHighlights(svg);
  const idSet = new Set(moverIds);
  svg.querySelectorAll<SVGGElement>('g.pawn').forEach((g) => {
    const id = g.getAttribute('data-mover-id');
    if (id && idSet.has(id)) {
      const circle = g.querySelector('circle');
      if (circle) {
        const glow = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        glow.setAttribute('cx', circle.getAttribute('cx') ?? '0');
        glow.setAttribute('cy', circle.getAttribute('cy') ?? '0');
        glow.setAttribute('r', circle.getAttribute('r') ?? '');
        glow.setAttribute('fill', 'none');
        glow.setAttribute('stroke', '#ffffff');
        glow.setAttribute('stroke-width', '3');
        glow.setAttribute('stroke-opacity', '0.5');
        glow.setAttribute('filter', 'url(#pawn-highlight-glow)');
        glow.setAttribute('pointer-events', 'none');
        glow.setAttribute('data-pawn-glow', '');
        g.insertBefore(glow, circle);
      }
      g.classList.add('pawn-highlighted');
    }
  });
}

/** Remove highlights from all pawns. */
export function clearPawnHighlights(svg: SVGSVGElement): void {
  svg.querySelectorAll<SVGGElement>('g.pawn.pawn-highlighted').forEach((g) => {
    const glow = g.querySelector('circle[data-pawn-glow]');
    if (glow) glow.remove();
    g.classList.remove('pawn-highlighted');
  });
}

/** Highlight a tile on the board by drawing a ring overlay at the given node position. */
export function highlightTile(svg: SVGSVGElement, nodeId: NodeId, board: BoardConfig, layout: BoardLayoutConfig): void {
  clearTileHighlight(svg);
  const pos = nodeIdToXY(nodeId, board, layout);
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.id = 'tile-highlight';
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', String(pos.x));
  circle.setAttribute('cy', String(pos.y));
  circle.setAttribute('r', '12');
  circle.setAttribute('fill', 'rgba(255, 255, 255, 0.25)');
  circle.setAttribute('stroke', '#fff');
  circle.setAttribute('stroke-width', '2');
  circle.setAttribute('stroke-dasharray', '4 2');
  circle.setAttribute('pointer-events', 'none');
  g.appendChild(circle);
  const root = svg.querySelector('#board-root');
  if (root) root.appendChild(g);
}

/** Remove landing tile highlight. */
export function clearTileHighlight(svg: SVGSVGElement): void {
  const old = svg.querySelector('#tile-highlight');
  if (old) old.remove();
}

/** Render heatmap overlay: circles at each node with intensity from visit counts. */
export function renderHeatmapOverlay(
  svg: SVGSVGElement,
  board: BoardConfig,
  layout: BoardLayoutConfig,
  visitCounts: Map<NodeId, number>
): void {
  const old = svg.querySelector('#heatmap-overlay');
  if (old) old.remove();

  if (visitCounts.size === 0) return;

  const max = Math.max(...visitCounts.values());
  if (max <= 0) return;

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.id = 'heatmap-overlay';
  g.setAttribute('pointer-events', 'none');

  const r = layout.moverRadius * 1.8;
  for (const [nodeId, count] of visitCounts) {
    const pos = nodeIdToXY(nodeId, board, layout);
    const intensity = count / max;
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(pos.x));
    circle.setAttribute('cy', String(pos.y));
    circle.setAttribute('r', String(r));
    circle.setAttribute('fill', `rgba(168, 85, 247, ${0.12 + 0.45 * intensity})`);
    circle.setAttribute('stroke', `rgba(168, 85, 247, ${0.3 + 0.5 * intensity})`);
    circle.setAttribute('stroke-width', '1');
    g.appendChild(circle);
  }

  const root = svg.querySelector('#board-root');
  if (root) root.appendChild(g);
}

/** Remove heatmap overlay. */
export function clearHeatmapOverlay(svg: SVGSVGElement): void {
  const old = svg.querySelector('#heatmap-overlay');
  if (old) old.remove();
}

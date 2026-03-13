/**
 * Board graph: adjacency functions for forward/backward movement.
 *
 * Topology:
 *   - Circular main track: T0 → T1 → … → T(N-1) → T0
 *   - Per-color Start spur: S_COLOR between beforeStartIndex and afterStartIndex
 *   - Per-color End zone spur: E_COLOR_0 → E_COLOR_1 → … → E_COLOR_(slots-1)  (dead end)
 *     Branches off main track at beforeStartIndex for the owning color.
 *   - Per-color Home: H_COLOR_k  (off-board, no graph edges)
 *
 * Blocking:
 *   - Occupied start (S_COLOR with owner pawn) blocks OTHER colors from passing
 *     through that start area in BOTH forward and backward directions.
 *   - Locked end-zone pawns act as walls (block movement in both directions).
 *   - Non-locked pawns in end zone are transparent (can pass through / share tiles).
 */

import type { BoardConfig, Mover, NodeId } from './types.js';

const NODE_ID_REGEX = /^(T)(\d+)$|^S_([A-Z]+)$|^E_([A-Z]+)_(\d+)$|^H_([A-Z]+)_(\d+)$/;

export function parseNodeId(nodeId: NodeId): { kind: 'T'; index: number } | { kind: 'S' | 'E' | 'H'; color: string; slot?: number } | null {
  const m = nodeId.match(NODE_ID_REGEX);
  if (!m) return null;
  if (m[1] === 'T') return { kind: 'T', index: parseInt(m[2], 10) };
  const color = (m[3] ?? m[4] ?? m[6]) as string;
  if (nodeId.startsWith('S_')) return { kind: 'S', color };
  if (nodeId.startsWith('E_')) return { kind: 'E', color, slot: parseInt(m[5] ?? '0', 10) };
  if (nodeId.startsWith('H_')) return { kind: 'H', color, slot: parseInt(m[7] ?? '0', 10) };
  return null;
}

export function isTrackNode(nodeId: NodeId): boolean { return nodeId.startsWith('T'); }
export function isStartNode(nodeId: NodeId): boolean { return nodeId.startsWith('S_'); }
export function isEndNode(nodeId: NodeId): boolean { return nodeId.startsWith('E_'); }
export function isHomeNode(nodeId: NodeId): boolean { return nodeId.startsWith('H_'); }

export function getColorFromNode(nodeId: NodeId): string | null {
  const p = parseNodeId(nodeId);
  if (p && (p.kind === 'S' || p.kind === 'E' || p.kind === 'H')) return p.color;
  return null;
}

export function trackNodeId(index: number, board: BoardConfig): NodeId {
  const n = board.mainTrackLength;
  return `T${((index % n) + n) % n}` as NodeId;
}

export function isStartBlocked(color: string, movers: Mover[]): boolean {
  const startNode = `S_${color}` as NodeId;
  return movers.some((m) => m.pos === startNode && m.color === color);
}

function hasLockedPawnAt(node: NodeId, movers: Mover[]): boolean {
  return movers.some((m) => m.pos === node && m.locked);
}

/**
 * The innermost unlocked end-zone slot for a color (fill order: E_3 first, then E_2, E_1, E_0).
 * Returns the slot index, or null if all slots are locked.
 */
export function getNextFillSlot(color: string, movers: Mover[], endZoneSlots: number = 4): number | null {
  for (let k = endZoneSlots - 1; k >= 0; k--) {
    const slotId = `E_${color}_${k}` as NodeId;
    if (!movers.some((m) => m.pos === slotId && m.locked)) return k;
  }
  return null;
}

/**
 * Get the next node when moving FORWARD from `nodeId` for a mover of `moverColor`.
 *
 * Returns null when movement is blocked:
 *   - Dead end (E_COLOR at last slot)
 *   - Blocked bypass (opponent's start is occupied)
 *   - Locked pawn ahead in end zone
 *   - Locked pawn at E_0 preventing end zone entry
 */
export function getForwardNeighbor(
  nodeId: NodeId,
  moverColor: string,
  board: BoardConfig,
  movers: Mover[],
): NodeId | null {
  const p = parseNodeId(nodeId);
  if (!p) return null;
  const N = board.mainTrackLength;
  const endZoneSlots = board.endZoneSlots ?? 4;

  if (p.kind === 'T') {
    const i = p.index;

    for (const c of Object.keys(board.colors)) {
      const cfg = board.colors[c];
      if (cfg.beforeStartIndex !== i) continue;

      if (c === moverColor) {
        const target = `E_${moverColor}_0` as NodeId;
        if (hasLockedPawnAt(target, movers)) return null;
        return target;
      }

      if (isStartBlocked(c, movers)) return null;
      return trackNodeId(cfg.afterStartIndex, board);
    }

    return trackNodeId((i + 1) % N, board);
  }

  if (p.kind === 'S' && p.color === moverColor) {
    const cfg = board.colors[moverColor];
    if (cfg) return trackNodeId(cfg.afterStartIndex, board);
    return null;
  }

  if (p.kind === 'E' && p.color === moverColor && p.slot !== undefined) {
    if (p.slot >= endZoneSlots - 1) return null; // physical dead end
    const target = `E_${moverColor}_${p.slot + 1}` as NodeId;
    if (hasLockedPawnAt(target, movers)) return null;
    return target;
  }

  return null;
}

/**
 * Get the previous node when moving BACKWARD from `nodeId` for a mover of `moverColor`.
 *
 * Returns null when movement is blocked:
 *   - Blocked bypass going backward (at afterStartIndex of another color whose start is occupied)
 *   - Locked pawn behind in end zone
 */
export function getBackwardNeighbor(
  nodeId: NodeId,
  moverColor: string,
  board: BoardConfig,
  movers: Mover[],
): NodeId | null {
  const p = parseNodeId(nodeId);
  if (!p) return null;
  const N = board.mainTrackLength;

  if (p.kind === 'S' && p.color === moverColor) {
    const cfg = board.colors[moverColor];
    if (cfg) return trackNodeId(cfg.beforeStartIndex, board);
    return null;
  }

  if (p.kind === 'E' && p.color === moverColor && p.slot !== undefined) {
    if (p.slot > 0) {
      const target = `E_${moverColor}_${p.slot - 1}` as NodeId;
      if (hasLockedPawnAt(target, movers)) return null;
      return target;
    }
    // E_0 → exit end zone back to beforeStart track tile
    const cfg = board.colors[moverColor];
    if (cfg) return trackNodeId(cfg.beforeStartIndex, board);
    return null;
  }

  if (p.kind === 'T') {
    const i = p.index;

    // Backward bypass: if at afterStartIndex of another color, check if blocked
    for (const c of Object.keys(board.colors)) {
      if (c === moverColor) continue;
      const cfg = board.colors[c];
      if (cfg.afterStartIndex === i) {
        if (isStartBlocked(c, movers)) return null;
        return trackNodeId(cfg.beforeStartIndex, board);
      }
    }

    return trackNodeId((i - 1 + N) % N, board);
  }

  return null;
}

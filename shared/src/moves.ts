/**
 * Unified walk: step-by-step movement with automatic direction reversal.
 *
 * Handles all movement scenarios through one algorithm:
 *   - Forward movement on the main track
 *   - Blocked-bypass reversal (opponent's start occupied) — both directions
 *   - End-zone bounce (dead end or locked pawn wall)
 *   - End-zone exit back onto main track
 *   - Backward movement (4-back card)
 */

import type { BoardConfig, Mover, NodeId } from './types.js';
import { getForwardNeighbor, getBackwardNeighbor } from './board.js';

export type Direction = 'forward' | 'backward';

export interface WalkResult {
  landingNode: NodeId;
  path: NodeId[];
}

function reverseDir(d: Direction): Direction {
  return d === 'forward' ? 'backward' : 'forward';
}

function getNeighbor(
  nodeId: NodeId,
  direction: Direction,
  moverColor: string,
  board: BoardConfig,
  movers: Mover[],
): NodeId | null {
  return direction === 'forward'
    ? getForwardNeighbor(nodeId, moverColor, board, movers)
    : getBackwardNeighbor(nodeId, moverColor, board, movers);
}

/**
 * Walk `steps` in `initialDirection` for the mover identified by `moverId`.
 *
 * At each step:
 *   1. Try to move in the current direction.
 *   2. If blocked (null), reverse direction and try again.
 *   3. If still blocked, the walk is impossible → return null.
 *
 * Direction can reverse multiple times (e.g., pinball between locked walls).
 */
export function walk(
  board: BoardConfig,
  movers: Mover[],
  moverId: string,
  steps: number,
  initialDirection: Direction = 'forward',
): WalkResult | null {
  const mover = movers.find((m) => m.id === moverId);
  if (!mover || steps <= 0) return null;

  const color = mover.color;
  let current: NodeId = mover.pos;
  let direction: Direction = initialDirection;
  const path: NodeId[] = [current];

  for (let remaining = steps; remaining > 0; remaining--) {
    let next = getNeighbor(current, direction, color, board, movers);

    if (next === null) {
      direction = reverseDir(direction);
      next = getNeighbor(current, direction, color, board, movers);
    }

    if (next === null) return null;

    current = next;
    path.push(current);
  }

  return { landingNode: current, path };
}

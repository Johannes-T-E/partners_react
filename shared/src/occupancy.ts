/**
 * Occupancy: which movers are on which node. Used for stacks (safe) and bump resolution.
 */

import type { Mover, NodeId } from './types.js';

export function getOccupancy(movers: Mover[]): Map<NodeId, Mover[]> {
  const map = new Map<NodeId, Mover[]>();
  for (const m of movers) {
    const list = map.get(m.pos) ?? [];
    list.push(m);
    map.set(m.pos, list);
  }
  return map;
}

/** Two or more movers of the same color on the same node = stack = safe. */
export function isStacked(movers: Mover[], nodeId: NodeId): boolean {
  const onNode = movers.filter((m) => m.pos === nodeId);
  if (onNode.length < 2) return false;
  const color = onNode[0].color;
  return onNode.every((m) => m.color === color);
}

/** Mover is safe if in home, in end zone, or in a stack. */
export function isMoverSafe(mover: Mover, movers: Mover[]): boolean {
  const pos = mover.pos;
  if (pos.startsWith('H_')) return true;
  if (pos.startsWith('E_')) return true;
  return isStacked(movers, pos);
}

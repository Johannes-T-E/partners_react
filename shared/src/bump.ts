/**
 * Bump and stack rules: landing on opponent bumps them home; landing on opponent stack bumps mover home.
 */

import type { GameState, Mover, NodeId } from './types.js';
import { isOpponent } from './types.js';
import { isStacked } from './occupancy.js';

function findHomeSlot(movers: Mover[], color: Mover['color'], pawnsPerPlayer: number): NodeId {
  const used = new Set(movers.filter((m) => m.pos.startsWith(`H_${color}_`)).map((m) => m.pos));
  for (let i = 0; i < pawnsPerPlayer; i++) {
    const slot = `H_${color}_${i}` as NodeId;
    if (!used.has(slot)) return slot;
  }
  return `H_${color}_0` as NodeId;
}

/**
 * Apply bump/stack rules when moverId lands on landingNode. Returns new movers array (immutable).
 */
export function resolveBumpAndStackRules(
  state: GameState,
  landingNode: NodeId,
  moverId: string
): Mover[] {
  const mover = state.movers.find((m) => m.id === moverId);
  if (!mover) return state.movers;

  const onLanding = state.movers.filter((m) => m.pos === landingNode && m.id !== moverId);
  if (onLanding.length === 0) {
    return state.movers.map((m) => (m.id === moverId ? { ...m, pos: landingNode } : m));
  }

  const movingColor = mover.color;
  const playerCount = state.settings?.playerCount ?? 4;
  const allSameColor = onLanding.every((m) => m.color === movingColor);
  const hasPartner = onLanding.some((m) => !isOpponent(m.color, movingColor, playerCount));
  const stack = isStacked([...onLanding, mover], landingNode);

  if (stack || (allSameColor && onLanding.length >= 1) || hasPartner) {
    return state.movers.map((m) => (m.id === moverId ? { ...m, pos: landingNode } : m));
  }

  const pawnsPerPlayer = state.settings?.pawnsPerPlayer ?? 4;

  if (onLanding.length >= 2 && onLanding.every((m) => isOpponent(m.color, movingColor, state.settings?.playerCount ?? 4))) {
    return state.movers.map((m) =>
      m.id === moverId ? { ...m, pos: findHomeSlot(state.movers, movingColor, pawnsPerPlayer) } : m
    );
  }

  if (onLanding.length === 1 && isOpponent(onLanding[0].color, movingColor, state.settings?.playerCount ?? 4)) {
    const sentHome = onLanding[0];
    const homeSlot = findHomeSlot(state.movers, sentHome.color, pawnsPerPlayer);
    return state.movers.map((m) => {
      if (m.id === moverId) return { ...m, pos: landingNode };
      if (m.id === sentHome.id) return { ...m, pos: homeSlot };
      return m;
    });
  }

  return state.movers.map((m) => (m.id === moverId ? { ...m, pos: landingNode } : m));
}

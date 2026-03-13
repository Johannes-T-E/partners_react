/**
 * Apply an action to state: update positions, resolve bump/stack, and lock end-zone pawns.
 */

import type { Action, Card, GameState, Mover, NodeId } from './types.js';
import { resolveBumpAndStackRules } from './bump.js';
import { getNextFillSlot, parseNodeId } from './board.js';
import { walk } from './moves.js';

/**
 * After a mover lands in an end zone, cascade-lock any unlocked pawns of that
 * color sitting on the current fill slot. Repeat until no more locks occur
 * (handles the case where locking one pawn shifts the fill slot onto another
 * unlocked pawn that arrived earlier via a bounce).
 */
function applyEndZoneLocking(movers: Mover[], moverId: string, endZoneSlots: number): Mover[] {
  const mover = movers.find((m) => m.id === moverId);
  if (!mover) return movers;

  const p = parseNodeId(mover.pos);
  if (!p || p.kind !== 'E') return movers;

  const color = p.color;
  let changed = true;
  while (changed) {
    changed = false;
    const fillSlot = getNextFillSlot(color, movers, endZoneSlots);
    if (fillSlot === null) break;

    const fillNodeId = `E_${color}_${fillSlot}` as NodeId;
    const pawnToLock = movers.find(
      (m) => m.color === color && !m.locked && m.pos === fillNodeId,
    );
    if (pawnToLock) {
      movers = movers.map((m) => (m.id === pawnToLock.id ? { ...m, locked: true } : m));
      changed = true;
    }
  }

  return movers;
}

export function applyAction(
  state: GameState,
  _playerIndex: number,
  _card: Card,
  action: Action,
): GameState {
  let movers = [...state.movers];
  const endZoneSlots = state.board.endZoneSlots ?? state.settings.pawnsPerPlayer;

  switch (action.kind) {
    case 'start': {
      const mover = movers.find((m) => m.id === action.moverId);
      if (!mover) return state;
      const startNode = `S_${mover.color}` as NodeId;
      movers = movers.map((m) => (m.id === action.moverId ? { ...m, pos: startNode } : m));
      movers = resolveBumpAndStackRules({ ...state, movers }, startNode, action.moverId);
      break;
    }

    case 'number': {
      const result = walk(state.board, movers, action.moverId, action.steps, 'forward');
      if (!result) return state;
      movers = movers.map((m) => (m.id === action.moverId ? { ...m, pos: result.landingNode } : m));
      movers = resolveBumpAndStackRules({ ...state, movers }, result.landingNode, action.moverId);
      movers = applyEndZoneLocking(movers, action.moverId, endZoneSlots);
      break;
    }

    case 'four_back': {
      const result = walk(state.board, movers, action.moverId, 4, 'backward');
      if (!result) return state;
      movers = movers.map((m) => (m.id === action.moverId ? { ...m, pos: result.landingNode } : m));
      movers = resolveBumpAndStackRules({ ...state, movers }, result.landingNode, action.moverId);
      break;
    }

    case 'one_or_14': {
      const result = walk(state.board, movers, action.moverId, action.steps, 'forward');
      if (!result) return state;
      movers = movers.map((m) => (m.id === action.moverId ? { ...m, pos: result.landingNode } : m));
      movers = resolveBumpAndStackRules({ ...state, movers }, result.landingNode, action.moverId);
      movers = applyEndZoneLocking(movers, action.moverId, endZoneSlots);
      break;
    }

    case 'seven_split': {
      for (const part of action.parts) {
        const result = walk(state.board, movers, part.moverId, part.steps, 'forward');
        if (!result) return state;
        movers = movers.map((m) => (m.id === part.moverId ? { ...m, pos: result.landingNode } : m));
        movers = resolveBumpAndStackRules({ ...state, movers }, result.landingNode, part.moverId);
        movers = applyEndZoneLocking(movers, part.moverId, endZoneSlots);
      }
      break;
    }

    case 'swap': {
      const a = movers.find((m) => m.id === action.moverIdA);
      const b = movers.find((m) => m.id === action.moverIdB);
      if (!a || !b) return state;
      movers = movers.map((m) => {
        if (m.id === action.moverIdA) return { ...m, pos: b.pos };
        if (m.id === action.moverIdB) return { ...m, pos: a.pos };
        return m;
      });
      break;
    }
  }

  return { ...state, movers };
}

/**
 * Shared history formatting: 1-based pawn numbers, bump/lock outcome hints.
 */

import type { Action, Card, GameState } from './types.js';
import { isOpponent } from './types.js';
import { walk } from './moves.js';
import { resolveBumpAndStackRules } from './bump.js';

/** Convert moverId (e.g. "red_0") to 1-based pawn index. */
export function pawnIndexFromMoverId(moverId: string): number {
  const parts = moverId.split('_');
  return Number(parts[1] ?? 0) + 1;
}

/** Extract color from moverId (e.g. "red_0" -> "red"). */
export function colorFromMoverId(moverId: string): string {
  const parts = moverId.split('_');
  return (parts[0] ?? '').toUpperCase();
}

function moverIdsFromAction(action: Action): string[] {
  if (action.kind === 'start') return [action.moverId];
  if (action.kind === 'number') return [action.moverId];
  if (action.kind === 'four_back') return [action.moverId];
  if (action.kind === 'one_or_14') return [action.moverId];
  if (action.kind === 'seven_split') return action.parts.map((p) => p.moverId);
  if (action.kind === 'swap') return [action.moverIdA, action.moverIdB];
  return [];
}

/** Get mover IDs affected by a history entry (for board highlighting). */
export function getMoverIdsFromEntry(entry: {
  action: Action | 'fold' | 'exchange' | 'shuffle' | 'deal';
  bumpedPawn?: { color: string; pawnNum: number };
}): string[] {
  const ids: string[] = [];
  if (typeof entry.action === 'object') {
    ids.push(...moverIdsFromAction(entry.action));
  }
  if (entry.bumpedPawn) {
    const moverId = `${entry.bumpedPawn.color.toLowerCase()}_${entry.bumpedPawn.pawnNum - 1}`;
    if (!ids.includes(moverId)) ids.push(moverId);
  }
  return ids;
}

/** Get landing node for an action (simulate without mutating). */
function getLandingNode(state: GameState, action: Action): string | null {
  const movers = [...state.movers];

  if (action.kind === 'start') {
    const mover = movers.find((m) => m.id === action.moverId);
    return mover ? `S_${mover.color}` : null;
  }
  if (action.kind === 'number' || action.kind === 'one_or_14') {
    const result = walk(state.board, movers, action.moverId, action.steps, 'forward');
    return result?.landingNode ?? null;
  }
  if (action.kind === 'four_back') {
    const result = walk(state.board, movers, action.moverId, 4, 'backward');
    return result?.landingNode ?? null;
  }
  if (action.kind === 'seven_split') {
    let m = movers;
    for (const part of action.parts) {
      const result = walk(state.board, m, part.moverId, part.steps, 'forward');
      if (!result) return null;
      m = m.map((x) => (x.id === part.moverId ? { ...x, pos: result.landingNode } : x));
      m = resolveBumpAndStackRules({ ...state, movers: m }, result.landingNode, part.moverId);
      m = [...m];
    }
    const last = action.parts[action.parts.length - 1];
    const mover = m.find((x) => x.id === last.moverId);
    return mover?.pos ?? null;
  }
  return null;
}

/** Detect if a move bumped opponent(s) home by comparing state before/after. */
function detectBumped(
  stateBefore: GameState,
  stateAfter: GameState,
  landingNode: string,
): { color: string; pawnNum: number } | null {
  const before = stateBefore.movers.filter((m) => m.pos === landingNode);
  const after = stateAfter.movers.filter((m) => m.pos === landingNode);
  const movingColor = after[0]?.color;
  if (!movingColor) return null;
  const playerCount = stateBefore.settings?.playerCount ?? 4;
  for (const m of before) {
    if (m.color !== movingColor && isOpponent(m.color, movingColor, playerCount)) {
      const sentHome = stateAfter.movers.find((x) => x.id === m.id);
      if (sentHome?.pos.startsWith('H_')) {
        const pawnNum = pawnIndexFromMoverId(m.id);
        return { color: m.color.toUpperCase(), pawnNum };
      }
    }
  }
  return null;
}

/** Get bumped pawn info for history display (null if no knockout). */
export function getBumpedPawn(
  stateBefore: GameState,
  stateAfter: GameState,
  action: Action,
): { color: string; pawnNum: number } | null {
  if (action.kind === 'seven_split') {
    let m = [...stateBefore.movers];
    for (const part of action.parts) {
      const result = walk(stateBefore.board, m, part.moverId, part.steps, 'forward');
      if (!result) continue;
      const bumped = detectBumped(
        { ...stateBefore, movers: m },
        stateAfter,
        result.landingNode,
      );
      if (bumped) return bumped;
      m = m.map((x) => (x.id === part.moverId ? { ...x, pos: result.landingNode } : x));
      m = resolveBumpAndStackRules({ ...stateBefore, movers: m }, result.landingNode, part.moverId);
      m = [...m];
    }
    return null;
  }
  const landing = getLandingNode(stateBefore, action);
  return landing ? detectBumped(stateBefore, stateAfter, landing) : null;
}

/** Detect if a mover got locked in end zone (was not locked before, is locked after). */
function detectNewlyLocked(
  stateBefore: GameState,
  stateAfter: GameState,
  moverId: string,
): boolean {
  const before = stateBefore.movers.find((m) => m.id === moverId);
  const after = stateAfter.movers.find((m) => m.id === moverId);
  return !before?.locked && (after?.locked ?? false);
}

/** Format action for history with 1-based pawn numbers and outcome hints. */
export function formatActionDescForHistory(
  color: string,
  card: Card,
  action: Action,
  stateBefore: GameState,
  stateAfter: GameState,
): string {
  const pawn = (moverId: string) => pawnIndexFromMoverId(moverId);
  const cardStr =
    card.type === 'NUMBER' ? String(card.value) : card.type.replace(/_/g, ' ').toLowerCase();

  if (action.kind === 'start') {
    return `${color} starts ${pawn(action.moverId)}`;
  }
  if (action.kind === 'number') {
    const landing = getLandingNode(stateBefore, action);
    const bumped = landing ? detectBumped(stateBefore, stateAfter, landing) : null;
    const locked = detectNewlyLocked(stateBefore, stateAfter, action.moverId);
    let suffix = '';
    if (bumped) suffix = ` (sent ${bumped.color}'s pawn ${bumped.pawnNum} home)`;
    else if (locked) suffix = ' (locked in end zone)';
    return `${color} moves ${pawn(action.moverId)} +${action.steps}${suffix}`;
  }
  if (action.kind === 'four_back') {
    const landing = getLandingNode(stateBefore, action);
    const bumped = landing ? detectBumped(stateBefore, stateAfter, landing) : null;
    const suffix = bumped ? ` (sent ${bumped.color}'s pawn ${bumped.pawnNum} home)` : '';
    return `${color} moves ${pawn(action.moverId)} -4${suffix}`;
  }
  if (action.kind === 'one_or_14') {
    const landing = getLandingNode(stateBefore, action);
    const bumped = landing ? detectBumped(stateBefore, stateAfter, landing) : null;
    const locked = detectNewlyLocked(stateBefore, stateAfter, action.moverId);
    let suffix = '';
    if (bumped) suffix = ` (sent ${bumped.color}'s pawn ${bumped.pawnNum} home)`;
    else if (locked) suffix = ' (locked in end zone)';
    return `${color} moves ${pawn(action.moverId)} +${action.steps}${suffix}`;
  }
  if (action.kind === 'seven_split') {
    const partsStr = action.parts.map((p) => `${pawn(p.moverId)}+${p.steps}`).join(', ');
    let lockedPart = '';
    for (const p of action.parts) {
      if (detectNewlyLocked(stateBefore, stateAfter, p.moverId)) {
        lockedPart = ' (locked in end zone)';
        break;
      }
    }
    return `${color} splits 7: ${partsStr}${lockedPart}`;
  }
  if (action.kind === 'swap') {
    return `${color} swaps ${pawn(action.moverIdA)} \u21C4 ${pawn(action.moverIdB)}`;
  }
  return `${color} plays ${cardStr}`;
}

/** State for "Game started" entry: full deck, no hands dealt yet. */
export function getStateForGameStarted(state: GameState): GameState {
  const playerCount = state.settings?.playerCount ?? 4;
  const allCards = [...(state.deck ?? []), ...(state.hands ?? []).flat()];
  return {
    ...state,
    deck: allCards,
    hands: Array.from({ length: playerCount }, () => []),
    discard: [],
    roundPhase: 'deal',
  };
}

/** State for shuffle history entry: deck has all cards (shuffled), hands not yet dealt. */
export function getStateForShuffleEntry(state: GameState): GameState {
  const playerCount = state.settings?.playerCount ?? 4;
  const allCards = [...(state.deck ?? []), ...(state.hands ?? []).flat()];
  return {
    ...state,
    deck: allCards,
    hands: Array.from({ length: playerCount }, () => []),
    discard: [],
  };
}

/** Format shuffle description. */
export function formatShuffleDesc(_state: GameState): string {
  return 'Deck shuffled';
}

/** Format deal description. */
export function formatDealDesc(_state: GameState): string {
  return 'New round dealt';
}

export type MoveType = 'play' | 'fold' | 'swap' | 'lock' | 'knockout' | 'start' | 'split' | 'meta';

/** Compute move types for filtering. Pass stateBefore/stateAfter for lock/knockout detection. */
export function computeMoveTypes(
  action: Action | 'fold' | 'exchange' | 'shuffle' | 'deal',
  stateAfter: GameState,
  stateBefore?: GameState,
): MoveType[] {
  const types: MoveType[] = [];
  if (action === 'fold') {
    types.push('fold');
    return types;
  }
  if (action === 'exchange' || action === 'shuffle' || action === 'deal') {
    types.push('meta');
    return types;
  }
  if (typeof action === 'object') {
    if (action.kind === 'swap') {
      types.push('swap');
      return types;
    }
    if (action.kind === 'seven_split') {
      types.push('split', 'play');
      if (stateBefore) {
        for (const p of action.parts) {
          if (detectNewlyLocked(stateBefore, stateAfter, p.moverId)) {
            types.push('lock');
            break;
          }
        }
      }
      return types;
    }
    if (action.kind === 'start') {
      types.push('start', 'play');
      return types;
    }
    if (action.kind === 'number' || action.kind === 'four_back' || action.kind === 'one_or_14') {
      types.push('play');
      if (stateBefore) {
        const landing = getLandingNode(stateBefore, action);
        if (landing && detectBumped(stateBefore, stateAfter, landing)) types.push('knockout');
        if (detectNewlyLocked(stateBefore, stateAfter, action.moverId)) types.push('lock');
      }
      return types;
    }
  }
  return types;
}

/** Get move types from entry; fallback to inferring from action when moveTypes absent. */
export function getMoveTypesForEntry(entry: {
  action: Action | 'fold' | 'exchange' | 'shuffle' | 'deal';
  state: GameState;
  moveTypes?: MoveType[];
}): MoveType[] {
  if (entry.moveTypes && entry.moveTypes.length > 0) return entry.moveTypes;
  return computeMoveTypes(entry.action, entry.state);
}

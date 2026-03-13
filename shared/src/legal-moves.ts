/**
 * Legal move generation for each card type.
 * All forward/backward movement uses the unified walk() function.
 * Locked movers (permanently placed in end zone) are skipped.
 */

import type { Action, Card, GameState } from './types.js';
import { getColorsForPlayerCount, getPartnerIndex, isOpponent, partnersExist } from './types.js';
import { isEndNode, isHomeNode, getNextFillSlot, parseNodeId } from './board.js';
import { getOccupancy, isMoverSafe, isStacked } from './occupancy.js';
import { resolveBumpAndStackRules } from './bump.js';
import { walk } from './moves.js';
import type { Mover, NodeId } from './types.js';

function simulateCascadeLock(movers: Mover[], moverId: string, endZoneSlots: number): Mover[] {
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

function isMovable(m: { locked?: boolean }): boolean {
  return !m.locked;
}

function playerMovers(state: GameState, playerIndex: number) {
  const playerCount = state.settings?.playerCount ?? 4;
  const color = getColorsForPlayerCount(playerCount)[playerIndex];
  return state.movers.filter((m) => m.color === color);
}

function partnerMovers(state: GameState, playerIndex: number) {
  const playerCount = state.settings?.playerCount ?? 4;
  const partnerIdx = getPartnerIndex(playerIndex, playerCount);
  if (partnerIdx < 0) return [];
  const color = getColorsForPlayerCount(playerCount)[partnerIdx];
  return state.movers.filter((m) => m.color === color);
}

/** True when every pawn of the player's color is locked in the end zone. */
export function allPawnsLocked(state: GameState, playerIndex: number): boolean {
  const own = playerMovers(state, playerIndex);
  return own.length > 0 && own.every((m) => m.locked);
}

/**
 * Returns the movers the player should control this turn.
 * If partners exist and all own pawns are locked, returns partner's movers; otherwise own movers.
 */
function effectiveMovers(state: GameState, playerIndex: number): Mover[] {
  const playerCount = state.settings?.playerCount ?? 4;
  if (!partnersExist(playerCount)) return playerMovers(state, playerIndex);
  if (allPawnsLocked(state, playerIndex)) return partnerMovers(state, playerIndex);
  return playerMovers(state, playerIndex);
}

function inPlayMovers(state: GameState, playerIndex: number) {
  return playerMovers(state, playerIndex).filter(
    (m) => !isHomeNode(m.pos) && !isEndNode(m.pos) && isMovable(m),
  );
}

/** Movers that can receive forward steps (track, start, or end zone; not home, not locked). Used for 7 split. */
function moversThatCanReceiveForwardSteps(state: GameState, playerIndex: number) {
  return playerMovers(state, playerIndex).filter(
    (m) => !isHomeNode(m.pos) && isMovable(m),
  );
}

export function listLegalActions(state: GameState, playerIndex: number, card: Card): Action[] {
  switch (card.type) {
    case 'NUMBER':
      return legalNumber(state, playerIndex, card.value);
    case 'START':
      return legalStart(state, playerIndex);
    case 'START_OR_8':
      return [...legalStart(state, playerIndex), ...legalNumber(state, playerIndex, 8)];
    case 'START_OR_13':
      return [...legalStart(state, playerIndex), ...legalNumber(state, playerIndex, 13)];
    case 'FOUR_BACK':
      return legalFourBack(state, playerIndex);
    case 'ONE_OR_14':
      return legalOneOr14(state, playerIndex);
    case 'SEVEN_SPLIT':
      return legalSevenSplit(state, playerIndex);
    case 'SWAP':
      return legalSwap(state, playerIndex);
    default:
      return [];
  }
}

function legalNumber(state: GameState, playerIndex: number, value: number): Action[] {
  const movers = effectiveMovers(state, playerIndex);
  const actions: Action[] = [];

  for (const mover of movers) {
    if (isHomeNode(mover.pos) || !isMovable(mover)) continue;
    const result = walk(state.board, state.movers, mover.id, value, 'forward');
    if (result) {
      actions.push({ kind: 'number', moverId: mover.id, steps: value });
    }
  }
  return actions;
}

function legalStart(state: GameState, playerIndex: number): Action[] {
  return effectiveMovers(state, playerIndex)
    .filter((m) => isHomeNode(m.pos))
    .map((m) => ({ kind: 'start' as const, moverId: m.id }));
}

function legalFourBack(state: GameState, playerIndex: number): Action[] {
  const movers = effectiveMovers(state, playerIndex).filter(
    (m) => !isEndNode(m.pos) && !isHomeNode(m.pos) && isMovable(m),
  );
  const actions: Action[] = [];

  for (const mover of movers) {
    const result = walk(state.board, state.movers, mover.id, 4, 'backward');
    if (result) {
      actions.push({ kind: 'four_back', moverId: mover.id });
    }
  }
  return actions;
}

function legalOneOr14(state: GameState, playerIndex: number): Action[] {
  const movers = effectiveMovers(state, playerIndex).filter(
    (m) => !isHomeNode(m.pos) && isMovable(m),
  );
  const actions: Action[] = [];

  for (const mover of movers) {
    const one = walk(state.board, state.movers, mover.id, 1, 'forward');
    if (one) actions.push({ kind: 'one_or_14', moverId: mover.id, steps: 1 });

    const fourteen = walk(state.board, state.movers, mover.id, 14, 'forward');
    if (fourteen) actions.push({ kind: 'one_or_14', moverId: mover.id, steps: 14 });
  }
  return actions;
}

function legalSevenSplit(state: GameState, playerIndex: number): Action[] {
  const playerCount = state.settings?.playerCount ?? 4;
  const ownColor = getColorsForPlayerCount(playerCount)[playerIndex];
  const partnerColor = getColorsForPlayerCount(playerCount)[getPartnerIndex(playerIndex, playerCount)];
  const endZoneSlots = state.board.endZoneSlots ?? state.settings.pawnsPerPlayer;
  const actions: Action[] = [];

  function getCandidates(movers: Mover[], usedIds: Set<string>): Mover[] {
    const ownAll = movers.filter((m) => m.color === ownColor);
    const ownLocked = ownAll.length > 0 && ownAll.every((m) => m.locked);
    const color = ownLocked ? partnerColor : ownColor;
    return movers.filter(
      (m) => m.color === color && !isHomeNode(m.pos) && isMovable(m) && !usedIds.has(m.id),
    );
  }

  function build(
    remaining: number,
    usedIds: Set<string>,
    parts: { moverId: string; steps: number }[],
    movers: Mover[],
  ): void {
    if (remaining === 0) {
      actions.push({ kind: 'seven_split', parts: [...parts] });
      return;
    }

    const candidates = getCandidates(movers, usedIds);
    for (const cand of candidates) {
      for (let s = 1; s <= remaining; s++) {
        const result = walk(state.board, movers, cand.id, s, 'forward');
        if (!result) continue;
        let newMovers = movers.map((m) => (m.id === cand.id ? { ...m, pos: result.landingNode } : m));
        newMovers = resolveBumpAndStackRules({ ...state, movers: newMovers }, result.landingNode, cand.id);
        newMovers = simulateCascadeLock(newMovers, cand.id, endZoneSlots);
        const newUsed = new Set(usedIds);
        newUsed.add(cand.id);
        const newParts = [...parts, { moverId: cand.id, steps: s }];

        if (s === remaining) {
          actions.push({ kind: 'seven_split', parts: newParts });
        } else {
          build(remaining - s, newUsed, newParts, newMovers);
        }
      }
    }
  }

  build(7, new Set(), [], [...state.movers]);
  return dedupeSevenSplit(actions);
}

function canSimulateSevenSplit(
  state: GameState,
  assignment: { moverId: string; steps: number }[],
): boolean {
  let movers = [...state.movers];
  const endZoneSlots = state.board.endZoneSlots ?? state.settings.pawnsPerPlayer;
  for (const part of assignment) {
    const result = walk(state.board, movers, part.moverId, part.steps, 'forward');
    if (!result) return false;
    movers = movers.map((m) => (m.id === part.moverId ? { ...m, pos: result.landingNode } : m));
    movers = resolveBumpAndStackRules({ ...state, movers }, result.landingNode, part.moverId);
    movers = simulateCascadeLock(movers, part.moverId, endZoneSlots);
  }
  return true;
}

function dedupeSevenSplit(actions: Action[]): Action[] {
  const seen = new Set<string>();
  return actions.filter((a) => {
    if (a.kind !== 'seven_split') return true;
    const key = a.parts
      .map((p) => `${p.moverId}:${p.steps}`)
      .join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function legalSwap(state: GameState, playerIndex: number): Action[] {
  const playerCount = state.settings?.playerCount ?? 4;
  const colors = getColorsForPlayerCount(playerCount);
  const currentColor = colors[playerIndex];
  const occupancy = getOccupancy(state.movers);

  const swappable = state.movers.filter((m) => {
    if (!m.pos.startsWith('T') || !isMovable(m)) return false;
    const isStack = isStacked(state.movers, m.pos);
    if (!isStack) return true;
    const onNode = occupancy.get(m.pos) ?? [];
    if (onNode.length === 0) return false;
    const stackColor = onNode[0].color;
    const protectedOpponent = isOpponent(stackColor, currentColor, playerCount);
    return !protectedOpponent;
  });

  const actions: Action[] = [];
  for (let i = 0; i < swappable.length; i++) {
    for (let j = i + 1; j < swappable.length; j++) {
      const a = swappable[i];
      const b = swappable[j];

      // Do not allow an opponent pawn to be swapped onto a single-color stack
      // owned by a specific color (even if that stack belongs to the current player's team).
      const posA = a.pos;
      const posB = b.pos;

      const onA = occupancy.get(posA);
      const stackColorA =
        onA && isStacked(state.movers, posA) && onA.length > 0 ? onA[0].color : null;
      if (stackColorA && isOpponent(b.color, stackColorA, playerCount)) {
        continue;
      }

      const onB = occupancy.get(posB);
      const stackColorB =
        onB && isStacked(state.movers, posB) && onB.length > 0 ? onB[0].color : null;
      if (stackColorB && isOpponent(a.color, stackColorB, playerCount)) {
        continue;
      }

      actions.push({ kind: 'swap', moverIdA: a.id, moverIdB: b.id });
    }
  }
  return actions;
}

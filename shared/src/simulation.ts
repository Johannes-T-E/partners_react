/**
 * Simulation: run games with strategies to detect winning patterns.
 * Uses full rules: deal 4 per round, partner exchange, play from hand.
 */

import type { Action, Card, GameState, GameSettings, Mover, BoardConfig, NodeId } from './types.js';
import { getColorsForPlayerCount, getPartnerIndex, getPlayerIndex, isOpponent, partnersExist } from './types.js';
import { parseNodeId, isHomeNode, isEndNode, isTrackNode, isStartNode } from './board.js';
import { applyAction } from './apply.js';
import { listLegalActions } from './legal-moves.js';
import {
  startGame,
  applyExchange,
  playFromHand,
  foldHand,
  getLegalActionsForCard,
} from './game-loop.js';
import { formatActionDescForHistory, formatShuffleDesc, formatDealDesc, getStateForShuffleEntry, getStateForGameStarted, computeMoveTypes, getBumpedPawn, type MoveType } from './history-format.js';

export type Strategy = (
  state: GameState,
  playerIndex: number,
  card: Card,
  legalActions: Action[]
) => Action | 'pass';

/** Create a strategy that picks a random legal action, or passes if none. */
export function createRandomStrategy(rng: () => number = Math.random): Strategy {
  return (_state, _playerIndex, _card, legalActions) => {
    if (legalActions.length === 0) return 'pass';
    return legalActions[Math.floor(rng() * legalActions.length)];
  };
}

/** Exchange strategy: pick random card index to trade with partner. */
export function createRandomExchangeStrategy(rng: () => number = Math.random) {
  return (_state: GameState, _playerIndex: number, hand: Card[]): number => {
    return Math.floor(rng() * hand.length);
  };
}

export type ExchangeStrategy = (state: GameState, playerIndex: number, hand: Card[]) => number;

// ── Distance helper ──

/**
 * Forward distance from a mover's current position to being locked in the end zone.
 * Lower = closer to winning. Returns 0 for locked pawns.
 */
export function distanceToEnd(mover: Mover, board: BoardConfig, playerCount: number): number {
  if (mover.locked) return 0;

  const endZoneSlots = board.endZoneSlots ?? 4;
  const p = parseNodeId(mover.pos);
  if (!p) return Infinity;

  const color = mover.color;
  const cfg = board.colors[color];
  if (!cfg) return Infinity;

  if (p.kind === 'H') {
    return board.mainTrackLength + endZoneSlots;
  }

  if (p.kind === 'E') {
    return endZoneSlots - (p.slot ?? 0);
  }

  if (p.kind === 'S') {
    return trackDistForward(cfg.afterStartIndex, cfg.beforeStartIndex, board.mainTrackLength) + endZoneSlots;
  }

  if (p.kind === 'T') {
    const beforeStart = cfg.beforeStartIndex;
    const dist = trackDistForward(p.index, beforeStart, board.mainTrackLength);
    return dist + endZoneSlots;
  }

  return Infinity;
}

function trackDistForward(from: number, to: number, N: number): number {
  return ((to - from) % N + N) % N;
}

// ── Smart strategy ──

/** Configurable weights for Smart and SmartPlus strategies. */
export interface SmartWeights {
  progress: number;
  bump: number;
  start: number;
  lock: number;
  exposed: number;
  partner: number;
  lockable: number;
}

export const DEFAULT_SMART_WEIGHTS: SmartWeights = {
  progress: 1,
  bump: 20,
  start: 15,
  lock: 50,
  exposed: -3,
  partner: 0.3,
  lockable: 25,
};

function scoreStateWithWeights(
  state: GameState,
  prevState: GameState,
  playerIndex: number,
  w: SmartWeights,
): number {
  const pc = state.settings.playerCount;
  const colors = getColorsForPlayerCount(pc);
  const myColor = colors[playerIndex];
  const partnerIdx = partnersExist(pc) ? getPartnerIndex(playerIndex, pc) : -1;
  const partnerColor = partnerIdx >= 0 ? colors[partnerIdx] : null;

  let score = 0;

  // Progress: sum of (maxDist - dist) for own movers
  const maxDist = state.board.mainTrackLength + (state.board.endZoneSlots ?? 4);
  for (const m of state.movers) {
    if (m.color === myColor) {
      const d = distanceToEnd(m, state.board, pc);
      score += (maxDist - d) * w.progress;
    }
    if (partnerColor && m.color === partnerColor) {
      const d = distanceToEnd(m, state.board, pc);
      score += (maxDist - d) * w.progress * w.partner;
    }
  }

  // Bump bonus: opponents that were NOT at home before but ARE at home now
  for (const m of state.movers) {
    if (!isOpponent(m.color, myColor, pc)) continue;
    if (!isHomeNode(m.pos)) continue;
    const prev = prevState.movers.find((pm) => pm.id === m.id);
    if (prev && !isHomeNode(prev.pos)) {
      score += w.bump;
    }
  }

  // Start bonus: own movers that were in home and now on start
  for (const m of state.movers) {
    if (m.color !== myColor) continue;
    if (!isStartNode(m.pos)) continue;
    const prev = prevState.movers.find((pm) => pm.id === m.id);
    if (prev && isHomeNode(prev.pos)) {
      score += w.start;
    }
  }

  // Lock bonus: own movers (and partner's when partners exist) that just got locked
  for (const m of state.movers) {
    if (m.color !== myColor && (!partnerColor || m.color !== partnerColor)) continue;
    if (!m.locked) continue;
    const prev = prevState.movers.find((pm) => pm.id === m.id);
    if (prev && !prev.locked) {
      score += m.color === myColor ? w.lock : w.lock * w.partner;
    }
  }

  // Exposure penalty: own movers on track tiles, alone (not stacked with friendly)
  for (const m of state.movers) {
    if (m.color !== myColor) continue;
    if (!isTrackNode(m.pos)) continue;
    const sameNode = state.movers.filter((o) => o.pos === m.pos && o.color === myColor);
    if (sameNode.length < 2) {
      score += w.exposed;
    }
  }

  return score;
}

/** Create a strategy that evaluates each legal action by simulating it and scoring the result. */
export function createSmartStrategy(rng: () => number = Math.random, weights: SmartWeights = DEFAULT_SMART_WEIGHTS): Strategy {
  return (state, playerIndex, card, legalActions) => {
    if (legalActions.length === 0) return 'pass';
    if (legalActions.length === 1) return legalActions[0];

    let bestScore = -Infinity;
    let bestAction = legalActions[0];

    for (const action of legalActions) {
      const nextState = applyAction(state, playerIndex, card, action);
      const s = scoreStateWithWeights(nextState, state, playerIndex, weights) + rng() * 0.01;
      if (s > bestScore) {
        bestScore = s;
        bestAction = action;
      }
    }

    return bestAction;
  };
}

// ── Smart+ strategy (card-aware end zone planning) ──

function cardsEqual(a: Card, b: Card): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'NUMBER' && b.type === 'NUMBER') return a.value === b.value;
  return true;
}

function removeCardFromHand(hand: Card[], card: Card): Card[] {
  const idx = hand.findIndex((c) => cardsEqual(c, card));
  if (idx < 0) return hand;
  return hand.slice(0, idx).concat(hand.slice(idx + 1));
}

/** Values a card can produce for forward end-zone movement (one pawn, one turn). */
function cardValuesForEndZone(card: Card): number[] {
  if (card.type === 'NUMBER') return [card.value];
  if (card.type === 'SEVEN_SPLIT') return [1, 2, 3, 4, 5, 6];
  if (card.type === 'FOUR_BACK') return [4];
  if (card.type === 'START_OR_8') return [8];
  if (card.type === 'START_OR_13') return [13];
  if (card.type === 'ONE_OR_14') return [14];
  return [];
}

/** Check if a pawn in the end zone can be locked with a single card from hand. */
function canLockPawnWithHand(mover: Mover, board: BoardConfig, hand: Card[]): boolean {
  if (mover.locked) return false;
  const p = parseNodeId(mover.pos);
  if (!p || p.kind !== 'E' || p.slot === undefined) return false;

  const endZoneSlots = board.endZoneSlots ?? 4;
  const stepsToLock = Math.max(0, endZoneSlots - 1 - p.slot);
  if (stepsToLock === 0) return true;

  const values = new Set<number>();
  for (const c of hand) {
    for (const v of cardValuesForEndZone(c)) values.add(v);
  }
  return values.has(stepsToLock);
}

/** Create a strategy that extends smart with card-aware end zone planning. */
export function createSmartPlusStrategy(rng: () => number = Math.random, weights: SmartWeights = DEFAULT_SMART_WEIGHTS): Strategy {
  return (state, playerIndex, card, legalActions) => {
    if (legalActions.length === 0) return 'pass';
    if (legalActions.length === 1) return legalActions[0];

    const hand = state.hands?.[playerIndex] ?? [];
    const remainingHand = removeCardFromHand(hand, card);

    const pc = state.settings.playerCount;
    const colors = getColorsForPlayerCount(pc);
    const myColor = colors[playerIndex];
    const partnerIdx = partnersExist(pc) ? getPartnerIndex(playerIndex, pc) : -1;
    const partnerColor = partnerIdx >= 0 ? colors[partnerIdx] : null;

    let bestScore = -Infinity;
    let bestAction = legalActions[0];

    for (const action of legalActions) {
      const nextState = applyAction(state, playerIndex, card, action);
      let s = scoreStateWithWeights(nextState, state, playerIndex, weights);

      for (const m of nextState.movers) {
        if (m.color !== myColor && (!partnerColor || m.color !== partnerColor)) continue;
        if (canLockPawnWithHand(m, nextState.board, remainingHand)) {
          s += m.color === myColor ? weights.lockable : weights.lockable * weights.partner;
        }
      }

      s += rng() * 0.01;
      if (s > bestScore) {
        bestScore = s;
        bestAction = action;
      }
    }

    return bestAction;
  };
}

// ── Smart exchange strategy ──

function cardMoveValue(card: Card): number {
  if (card.type === 'NUMBER') return card.value;
  if (card.type === 'START_OR_8') return 8;
  if (card.type === 'START_OR_13') return 13;
  if (card.type === 'ONE_OR_14') return 14;
  if (card.type === 'SEVEN_SPLIT') return 7;
  if (card.type === 'FOUR_BACK') return 4;
  if (card.type === 'SWAP') return 5;
  if (card.type === 'START') return 0;
  return 0;
}

/**
 * Smart exchange: give the partner the card most useful to them.
 * If partner has pawns in home, prefer START cards. Otherwise prefer high-value movement cards.
 */
export function createSmartExchangeStrategy(rng: () => number = Math.random): ExchangeStrategy {
  return (state, playerIndex, hand) => {
    if (hand.length <= 1) return 0;
    const pc = state.settings.playerCount;
    if (!partnersExist(pc)) return Math.floor(rng() * hand.length);

    const colors = getColorsForPlayerCount(pc);
    const partnerIdx = getPartnerIndex(playerIndex, pc);
    const partnerColor = partnerIdx >= 0 ? colors[partnerIdx] : null;
    if (!partnerColor) return Math.floor(rng() * hand.length);
    const partnerMovers = state.movers.filter((m) => m.color === partnerColor);
    const partnerHasHomeMovers = partnerMovers.some((m) => isHomeNode(m.pos));

    let bestIdx = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < hand.length; i++) {
      const card = hand[i];
      let score = 0;

      if (partnerHasHomeMovers) {
        if (card.type === 'START') score += 100;
        else if (card.type === 'START_OR_8') score += 90;
        else if (card.type === 'START_OR_13') score += 85;
        else score += cardMoveValue(card);
      } else {
        score += cardMoveValue(card);
        if (card.type === 'START') score -= 5;
      }

      score += rng() * 0.01;

      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    return bestIdx;
  };
}

export interface GameResult {
  winner: number | null;
  turns: number;
  maxTurns?: number;
}

function resolvePlayStrategy(strategyOrStrategies: Strategy | Strategy[], playerIndex: number): Strategy {
  return Array.isArray(strategyOrStrategies)
    ? (strategyOrStrategies[playerIndex] ?? strategyOrStrategies[0])
    : strategyOrStrategies;
}

function resolveExchangeStrategy(
  exchangeStrategyOverride: ExchangeStrategy | ExchangeStrategy[] | undefined,
  playerIndex: number,
  fallback: ExchangeStrategy,
): ExchangeStrategy {
  if (!exchangeStrategyOverride) return fallback;
  return Array.isArray(exchangeStrategyOverride)
    ? (exchangeStrategyOverride[playerIndex] ?? exchangeStrategyOverride[0] ?? fallback)
    : exchangeStrategyOverride;
}

/** Run a single game to completion. Uses full rules: deal, exchange, play from hands. */
export function runGame(
  settings: GameSettings,
  strategyOrStrategies: Strategy | Strategy[],
  rng: () => number = Math.random,
  maxTurns: number = 10000,
  exchangeStrategyOverride?: ExchangeStrategy | ExchangeStrategy[],
): GameResult {
  const defaultExchange = createRandomExchangeStrategy(rng);
  let state = startGame(settings, rng);
  let turns = 0;

  while (turns < maxTurns) {
    if (state.roundPhase === 'exchange') {
      const playerCount = state.settings.playerCount;
      const selections: number[] = [];
      for (let p = 0; p < playerCount; p++) {
        const hand = state.hands?.[p] ?? [];
        const ex = resolveExchangeStrategy(exchangeStrategyOverride, p, defaultExchange);
        selections.push(hand.length > 0 ? ex(state, p, hand) : 0);
      }
      state = applyExchange(state, selections, rng);
      continue;
    }

    if (state.roundPhase !== 'play') break;

    const playerIndex = state.currentPlayerIndex ?? 0;
    const hand = state.hands?.[playerIndex] ?? [];
    if (hand.length === 0) {
      const result = foldHand(state, rng);
      state = result.state;
      if (result.winner !== null) return { winner: result.winner, turns };
      continue;
    }

    const strategy = resolvePlayStrategy(strategyOrStrategies, playerIndex);
    let played = false;
    for (let hi = 0; hi < hand.length; hi++) {
      const card = hand[hi];
      const legalActions = getLegalActionsForCard(state, playerIndex, card);
      const choice = legalActions.length > 0 ? strategy(state, playerIndex, card, legalActions) : 'pass';
      if (choice !== 'pass') {
        const result = playFromHand(state, hi, choice, rng);
        state = result.state;
        turns++;
        if (result.winner !== null) return { winner: result.winner, turns };
        played = true;
        break;
      }
    }
    if (!played) {
      const result = foldHand(state, rng);
      state = result.state;
      turns++;
    }
  }

  return { winner: null, turns, maxTurns };
}

/** Run a single game, accumulating per-player stats (no history). */
export function runGameWithPerPlayerStats(
  settings: GameSettings,
  strategyOrStrategies: Strategy | Strategy[],
  rng: () => number = Math.random,
  maxTurns: number = 10000,
  exchangeStrategyOverride?: ExchangeStrategy | ExchangeStrategy[],
): GameResult & { perPlayerStats: PerPlayerHistoryStats } {
  const playerCount = settings.playerCount;
  const colors = getColorsForPlayerCount(playerCount);
  const perPlayer: PerPlayerHistoryStats = {
    knockoutsDealt: new Array(playerCount).fill(0),
    knockoutsReceived: new Array(playerCount).fill(0),
    folds: new Array(playerCount).fill(0),
    locks: new Array(playerCount).fill(0),
    swaps: new Array(playerCount).fill(0),
  };

  const defaultExchange = createRandomExchangeStrategy(rng);
  let state = startGame(settings, rng);
  let turns = 0;

  while (turns < maxTurns) {
    if (state.roundPhase === 'exchange') {
      const pc = state.settings.playerCount;
      const selections: number[] = [];
      for (let p = 0; p < pc; p++) {
        const hand = state.hands?.[p] ?? [];
        const ex = resolveExchangeStrategy(exchangeStrategyOverride, p, defaultExchange);
        selections.push(hand.length > 0 ? ex(state, p, hand) : 0);
      }
      state = applyExchange(state, selections, rng);
      continue;
    }

    if (state.roundPhase !== 'play') break;

    const playerIndex = state.currentPlayerIndex ?? 0;
    const playerColor = colors[playerIndex] ?? `P${playerIndex}`;
    const hand = state.hands?.[playerIndex] ?? [];
    if (hand.length === 0) {
      const result = foldHand(state, rng);
      state = result.state;
      const actorPlayer = colorToPlayerIndex(playerColor, playerCount);
      if (actorPlayer >= 0) perPlayer.folds[actorPlayer]++;
      if (result.winner !== null) return { winner: result.winner, turns, perPlayerStats: perPlayer };
      continue;
    }

    const strategy = resolvePlayStrategy(strategyOrStrategies, playerIndex);
    let played = false;
    for (let hi = 0; hi < hand.length; hi++) {
      const card = hand[hi];
      const legalActions = getLegalActionsForCard(state, playerIndex, card);
      const choice = legalActions.length > 0 ? strategy(state, playerIndex, card, legalActions) : 'pass';
      if (choice !== 'pass') {
        const stateBefore = state;
        const result = playFromHand(state, hi, choice as Action, rng);
        state = result.state;
        turns++;
        const stateForPlay = result.stateAfterPlay ?? result.state;
        const types = computeMoveTypes(choice as Action, stateForPlay, stateBefore);
        const bumped = getBumpedPawn(stateBefore, stateForPlay, choice as Action);
        const actorPlayer = colorToPlayerIndex(playerColor, playerCount);

        if (types.includes('knockout')) {
          if (actorPlayer >= 0) perPlayer.knockoutsDealt[actorPlayer]++;
          if (bumped) {
            const victimPlayer = colorToPlayerIndex(bumped.color, playerCount);
            perPlayer.knockoutsReceived[victimPlayer]++;
          }
        }
        if (types.includes('lock') && actorPlayer >= 0) perPlayer.locks[actorPlayer]++;
        if (types.includes('swap') && actorPlayer >= 0) perPlayer.swaps[actorPlayer]++;
        if (result.winner !== null) return { winner: result.winner, turns, perPlayerStats: perPlayer };
        played = true;
        break;
      }
    }
    if (!played) {
      const result = foldHand(state, rng);
      state = result.state;
      turns++;
      const actorPlayer = colorToPlayerIndex(playerColor, playerCount);
      if (actorPlayer >= 0) perPlayer.folds[actorPlayer]++;
    }
  }

  return { winner: null, turns, maxTurns, perPlayerStats: perPlayer };
}

/** Merge per-player stats from multiple games. */
export function mergePerPlayerStats(
  acc: PerPlayerHistoryStats,
  add: PerPlayerHistoryStats,
  playerCount: number,
): void {
  for (let i = 0; i < playerCount; i++) {
    acc.knockoutsDealt[i] += add.knockoutsDealt[i] ?? 0;
    acc.knockoutsReceived[i] += add.knockoutsReceived[i] ?? 0;
    acc.folds[i] += add.folds[i] ?? 0;
    acc.locks[i] += add.locks[i] ?? 0;
    acc.swaps[i] += add.swaps[i] ?? 0;
  }
}

export type { MoveType } from './history-format.js';

export interface HistoryEntry {
  turn: number;
  playerColor: string;
  card: Card | null;
  action: Action | 'fold' | 'exchange' | 'shuffle' | 'deal';
  description: string;
  state: GameState;
  /** For filtering: play, fold, swap, lock, knockout, start, split, meta */
  moveTypes?: MoveType[];
  /** Pawn sent home by knockout (for display) */
  bumpedPawn?: { color: string; pawnNum: number };
}

export interface GameResultWithHistory extends GameResult {
  history: HistoryEntry[];
}

/** Run a single game recording every state transition for replay. */
export function runGameWithHistory(
  settings: GameSettings,
  strategyOrStrategies: Strategy | Strategy[],
  rng: () => number = Math.random,
  maxTurns: number = 10000,
  exchangeStrategyOverride?: ExchangeStrategy | ExchangeStrategy[],
): GameResultWithHistory {
  const defaultExchange = createRandomExchangeStrategy(rng);
  let state = startGame(settings, rng);
  let turns = 0;
  const history: HistoryEntry[] = [];
  const colors = getColorsForPlayerCount(settings.playerCount);

  const META_TURN = -1;
  history.push({
    turn: META_TURN,
    playerColor: '',
    card: null,
    action: 'exchange',
    description: 'Game started',
    state: structuredClone(getStateForGameStarted(state)),
    moveTypes: ['meta'],
  });

  const dealerColor = colors[state.dealerIndex ?? 0] ?? '';
  if (state.shuffledThisRound) {
    history.push({ turn: META_TURN, playerColor: dealerColor, card: null, action: 'shuffle', description: formatShuffleDesc(state), state: structuredClone(getStateForShuffleEntry(state)), moveTypes: ['meta'] });
  }
  history.push({ turn: META_TURN, playerColor: dealerColor, card: null, action: 'deal', description: formatDealDesc(state), state: structuredClone(state), moveTypes: ['meta'] });

  while (turns < maxTurns) {
    if (state.roundPhase === 'exchange') {
      const playerCount = state.settings.playerCount;
      const selections: number[] = [];
      for (let p = 0; p < playerCount; p++) {
        const hand = state.hands?.[p] ?? [];
        const ex = resolveExchangeStrategy(exchangeStrategyOverride, p, defaultExchange);
        selections.push(hand.length > 0 ? ex(state, p, hand) : 0);
      }
      state = applyExchange(state, selections, rng);
      history.push({
        turn: META_TURN,
        playerColor: '',
        card: null,
        action: 'exchange',
        description: 'Cards exchanged',
        state: structuredClone(state),
        moveTypes: ['meta'],
      });
      continue;
    }

    if (state.roundPhase !== 'play') break;

    const playerIndex = state.currentPlayerIndex ?? 0;
    const playerColor = colors[playerIndex] ?? `P${playerIndex}`;
    const hand = state.hands?.[playerIndex] ?? [];
    if (hand.length === 0) {
      const result = foldHand(state, rng);
      state = result.state;
      if (result.winner !== null) return { winner: result.winner, turns, history };
      if (state.roundPhase === 'exchange') {
        if (state.shuffledThisRound) {
          history.push({ turn: META_TURN, playerColor: colors[state.dealerIndex ?? 0] ?? '', card: null, action: 'shuffle', description: formatShuffleDesc(state), state: structuredClone(getStateForShuffleEntry(state)), moveTypes: ['meta'] });
        }
        history.push({ turn: META_TURN, playerColor: colors[state.dealerIndex ?? 0] ?? '', card: null, action: 'deal', description: formatDealDesc(state), state: structuredClone(state), moveTypes: ['meta'] });
      }
      continue;
    }

    const strategy = resolvePlayStrategy(strategyOrStrategies, playerIndex);
    let played = false;
    for (let hi = 0; hi < hand.length; hi++) {
      const card = hand[hi];
      const legalActions = getLegalActionsForCard(state, playerIndex, card);
      const choice = legalActions.length > 0 ? strategy(state, playerIndex, card, legalActions) : 'pass';
      if (choice !== 'pass') {
        const stateBefore = state;
        const result = playFromHand(state, hi, choice as Action, rng);
        state = result.state;
        turns++;
        const stateForPlayEntry = result.stateAfterPlay ?? result.state;
        const desc = formatActionDescForHistory(playerColor, card, choice as Action, stateBefore, stateForPlayEntry);
        const bumped = getBumpedPawn(stateBefore, stateForPlayEntry, choice as Action);
        history.push({ turn: turns, playerColor, card, action: choice as Action, description: desc, state: structuredClone(stateForPlayEntry), moveTypes: computeMoveTypes(choice as Action, stateForPlayEntry, stateBefore), bumpedPawn: bumped ?? undefined });
        if (result.winner !== null) return { winner: result.winner, turns, history };
        if (state.roundPhase === 'exchange') {
          if (state.shuffledThisRound) {
            history.push({ turn: META_TURN, playerColor: colors[state.dealerIndex ?? 0] ?? '', card: null, action: 'shuffle', description: formatShuffleDesc(state), state: structuredClone(getStateForShuffleEntry(state)), moveTypes: ['meta'] });
          }
          history.push({ turn: META_TURN, playerColor: colors[state.dealerIndex ?? 0] ?? '', card: null, action: 'deal', description: formatDealDesc(state), state: structuredClone(state), moveTypes: ['meta'] });
        }
        played = true;
        break;
      }
    }
    if (!played) {
      const result = foldHand(state, rng);
      state = result.state;
      turns++;
      const stateForFoldEntry = result.stateAfterPlay ?? result.state;
      history.push({ turn: turns, playerColor, card: null, action: 'fold', description: `${playerColor} folded`, state: structuredClone(stateForFoldEntry), moveTypes: ['fold'] });
      if (state.roundPhase === 'exchange') {
        if (state.shuffledThisRound) {
          history.push({ turn: META_TURN, playerColor: colors[state.dealerIndex ?? 0] ?? '', card: null, action: 'shuffle', description: formatShuffleDesc(state), state: structuredClone(getStateForShuffleEntry(state)), moveTypes: ['meta'] });
        }
        history.push({ turn: META_TURN, playerColor: colors[state.dealerIndex ?? 0] ?? '', card: null, action: 'deal', description: formatDealDesc(state), state: structuredClone(state), moveTypes: ['meta'] });
      }
    }
  }

  return { winner: null, turns, maxTurns, history };
}

export interface TurnStats {
  minTurns: number;
  maxTurns: number;
  avgTurns: number;
  medianTurns: number;
  p25Turns: number;
  p75Turns: number;
  stdDevTurns: number;
  /** Interquartile range: P75 - P25 */
  iqrTurns: number;
}

/** Per-player stats from history (sampled games). */
export interface PerPlayerHistoryStats {
  knockoutsDealt: number[];
  knockoutsReceived: number[];
  folds: number[];
  locks: number[];
  swaps: number[];
}

/** Per-game stats from history (sampled games). */
export interface HistoryStats {
  sampleSize: number;
  /** Per-player breakdown. */
  perPlayer?: PerPlayerHistoryStats;
}

export interface SimulationResult extends TurnStats {
  totalGames: number;
  teamWins: number[];
  draws: number;
  /** Games that hit the turn limit (same as draws when draws are timeouts). */
  maxTurnsReached: number;
  /** Games with turns < 100. */
  shortGamesCount: number;
  /** Games with turns > 250. */
  longGamesCount: number;
  /** (winner, turns) per game for win-rate-by-length. Omitted if > 10k games. */
  winnerTurns?: { winner: number; turns: number }[];
  /** Per-game stats from history. Only present when games with history were run. */
  historyStats?: HistoryStats;
  /** Raw turn counts per game, for charting (e.g. box plot). Omitted if too large. */
  turns?: number[];
}

export function summarizeTurns(turns: number[]): TurnStats {
  if (turns.length === 0) {
    return {
      minTurns: 0,
      maxTurns: 0,
      avgTurns: 0,
      medianTurns: 0,
      p25Turns: 0,
      p75Turns: 0,
      stdDevTurns: 0,
      iqrTurns: 0,
    };
  }

  const n = turns.length;
  let sum = 0;
  for (const t of turns) sum += t;
  const avg = sum / n;

  let varianceSum = 0;
  for (const t of turns) {
    const diff = t - avg;
    varianceSum += diff * diff;
  }
  const stdDev = Math.sqrt(varianceSum / n);

  const sorted = [...turns].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.floor(p * (n - 1))];
  const p25 = at(0.25);
  const p75 = at(0.75);

  return {
    minTurns: sorted[0],
    maxTurns: sorted[sorted.length - 1],
    avgTurns: avg,
    medianTurns: at(0.5),
    p25Turns: p25,
    p75Turns: p75,
    stdDevTurns: stdDev,
    iqrTurns: p75 - p25,
  };
}

/** Map player color to player index. */
function colorToPlayerIndex(color: string, playerCount: number): number {
  const colors = getColorsForPlayerCount(playerCount);
  const idx = colors.findIndex((c) => c.toUpperCase() === color.toUpperCase());
  return idx >= 0 ? idx : 0;
}

/** Per-game stats for a single game. */
export interface SingleGameStats {
  knockouts: number;
  folds: number;
  locks: number;
  swaps: number;
  rounds: number;
}

/** Compute stats for a single game from its history. */
export function computeSingleGameStats(
  game: GameResultWithHistory,
  playerCount: number,
): SingleGameStats {
  let knockouts = 0;
  let folds = 0;
  let locks = 0;
  let swaps = 0;
  let rounds = 0;
  for (const e of game.history) {
    const types = e.moveTypes ?? [];
    if (types.includes('knockout')) knockouts++;
    if (e.action === 'fold') folds++;
    if (types.includes('lock')) locks++;
    if (types.includes('swap')) swaps++;
    if (e.action === 'deal') rounds++;
  }
  return { knockouts, folds, locks, swaps, rounds };
}

/** Extract per-player stats from a single game with history. */
export function extractPerPlayerStatsFromGame(
  game: GameResultWithHistory,
  playerCount: number,
): PerPlayerHistoryStats {
  const perPlayer: PerPlayerHistoryStats = {
    knockoutsDealt: new Array(playerCount).fill(0),
    knockoutsReceived: new Array(playerCount).fill(0),
    folds: new Array(playerCount).fill(0),
    locks: new Array(playerCount).fill(0),
    swaps: new Array(playerCount).fill(0),
  };
  for (const e of game.history) {
    const types = e.moveTypes ?? [];
    const actorPlayer = e.playerColor ? colorToPlayerIndex(e.playerColor, playerCount) : -1;
    if (types.includes('knockout')) {
      if (actorPlayer >= 0) perPlayer.knockoutsDealt[actorPlayer]++;
      if (e.bumpedPawn) {
        const victimPlayer = colorToPlayerIndex(e.bumpedPawn.color, playerCount);
        perPlayer.knockoutsReceived[victimPlayer]++;
      }
    }
    if (e.action === 'fold' && actorPlayer >= 0) perPlayer.folds[actorPlayer]++;
    if (types.includes('lock') && actorPlayer >= 0) perPlayer.locks[actorPlayer]++;
    if (types.includes('swap') && actorPlayer >= 0) perPlayer.swaps[actorPlayer]++;
  }
  return perPlayer;
}

/** Compute per-game stats from games with history. */
export function computeHistoryStats(
  games: GameResultWithHistory[],
  playerCount: number,
): HistoryStats | undefined {
  if (games.length === 0) return undefined;
  const perPlayer: PerPlayerHistoryStats = {
    knockoutsDealt: new Array(playerCount).fill(0),
    knockoutsReceived: new Array(playerCount).fill(0),
    folds: new Array(playerCount).fill(0),
    locks: new Array(playerCount).fill(0),
    swaps: new Array(playerCount).fill(0),
  };
  for (const g of games) mergePerPlayerStats(perPlayer, extractPerPlayerStatsFromGame(g, playerCount), playerCount);
  return { sampleSize: games.length, perPlayer };
}

/** Run many games and aggregate results. */
export function runSimulation(
  settings: GameSettings,
  strategyOrStrategies: Strategy | Strategy[],
  numGames: number,
  rng: () => number = Math.random,
  maxTurnsPerGame: number = 10000
): SimulationResult {
  const playerCount = settings.playerCount;
  const winCountLength = partnersExist(playerCount) ? Math.floor(playerCount / 2) : playerCount;
  const teamWins = new Array(winCountLength).fill(0);
  let draws = 0;
  const turns: number[] = [];
  let shortGamesCount = 0;
  let longGamesCount = 0;
  const winnerTurns: { winner: number; turns: number }[] = numGames <= 10000 ? [] : [];

  for (let i = 0; i < numGames; i++) {
    const result = runGame(settings, strategyOrStrategies, rng, maxTurnsPerGame);
    if (result.winner !== null) {
      teamWins[result.winner]++;
      if (numGames <= 10000) winnerTurns.push({ winner: result.winner, turns: result.turns });
    } else {
      draws++;
    }
    turns.push(result.turns);
    if (result.turns < 100) shortGamesCount++;
    if (result.turns > 250) longGamesCount++;
  }

  const stats = summarizeTurns(turns);

  return {
    totalGames: numGames,
    teamWins,
    draws,
    maxTurnsReached: draws,
    shortGamesCount,
    longGamesCount,
    winnerTurns: numGames <= 10000 && winnerTurns.length > 0 ? winnerTurns : undefined,
    ...stats,
  };
}

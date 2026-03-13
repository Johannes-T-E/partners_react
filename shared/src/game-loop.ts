/**
 * Game loop: turn advancement, play, pass.
 * Supports full rules: deal 4 per round, partner exchange, dealer rotation.
 */

import type { Action, Card, GameState } from './types.js';
import { getColorsForPlayerCount, getPartnerIndex, partnersExist } from './types.js';
import { applyAction } from './apply.js';
import { checkWin } from './win.js';
import { listLegalActions } from './legal-moves.js';
import { createDeck, shuffle, drawCard, drawCards } from './deck.js';
import { createGameStateFromSettings } from './game-state.js';

export interface PlayResult {
  state: GameState;
  winner: number | null;
  passed: boolean;
  /** When round ended (transition to exchange), state right after play/fold, before deal. Use for history play entry. */
  stateAfterPlay?: GameState;
}

/** Collect all cards. Order: discard + hands + deck, so deck (remaining) is "on top" for dealing (pop). */
function collectAllCards(state: GameState): Card[] {
  const cards = [...(state.discard ?? [])];
  for (const hand of state.hands ?? []) {
    cards.push(...hand);
  }
  cards.push(...(state.deck ?? []));
  return cards;
}

/** Deal a round: collect cards, shuffle (or not per shuffleMode), deal 4 to each. */
export function dealRound(
  state: GameState,
  rng: () => number = Math.random
): GameState {
  const { playerCount } = state.settings;
  const cardsNeeded = 4 * playerCount;
  const shuffleMode = state.settings.shuffleMode ?? 'always';
  const shouldShuffle =
    shuffleMode === 'always' ||
    (shuffleMode === 'when_needed' && (state.deck ?? []).length < cardsNeeded);

  let deck: Card[];
  let discard: Card[];

  if (shouldShuffle) {
    const allCards = shuffle(collectAllCards(state), rng);
    deck = allCards;
    discard = [];
  } else {
    deck = [...(state.deck ?? [])];
    discard = [...(state.discard ?? [])];
  }

  const hands: Card[][] = Array(playerCount);
  const dealerIndex = state.dealerIndex ?? 0;
  const dealerRoundsRemaining = state.dealerRoundsRemaining ?? 3;

  for (let i = 0; i < playerCount; i++) {
    const player = (dealerIndex + 1 + i) % playerCount;
    hands[player] = drawCards(deck, discard, 4, rng);
  }

  const roundPhase = partnersExist(playerCount) ? 'exchange' : 'play';
  return {
    ...state,
    deck,
    discard,
    hands,
    roundPhase,
    foldedThisRound: [],
    exchangeSelection: roundPhase === 'exchange' ? Array(playerCount).fill(null) : undefined,
    currentPlayerIndex: (dealerIndex + 1) % playerCount,
    dealerIndex,
    dealerRoundsRemaining,
    shuffledThisRound: shouldShuffle,
  };
}

/** Apply partner exchange. No-op when no partners (2 or odd player count). */
export function applyExchange(
  state: GameState,
  selections: number[],
  rng: () => number = Math.random
): GameState {
  const { playerCount } = state.settings;
  if (!partnersExist(playerCount)) return { ...state, roundPhase: 'play' };

  const hands = (state.hands ?? []).map((h) => [...h]);
  const teamCount = Math.floor(playerCount / 2);
  for (let p = 0; p < teamCount; p++) {
    const partner = getPartnerIndex(p, playerCount);
    if (partner < 0) continue;
    const idxP = selections[p];
    const idxPartner = selections[partner];
    if (idxP == null || idxPartner == null) continue;
    const handP = hands[p];
    const handPartner = hands[partner];
    if (!handP || !handPartner || idxP >= handP.length || idxPartner >= handPartner.length) continue;
    const cardP = handP[idxP];
    const cardPartner = handPartner[idxPartner];
    handP[idxP] = { ...cardPartner, originalOwner: partner };
    handPartner[idxPartner] = { ...cardP, originalOwner: p };
  }

  return {
    ...state,
    hands,
    roundPhase: 'play',
    exchangeSelection: undefined,
  };
}

/** Start a new game: full deck, initial deal, phase = exchange. */
export function startGame(
  settings: GameState['settings'],
  rng: () => number = Math.random
): GameState {
  const deck = shuffle(createDeck(settings), rng);
  const state = createGameStateFromSettings(settings, {
    deck,
    discard: [],
    hands: [],
    dealerIndex: 0,
    dealerRoundsRemaining: 3,
    roundPhase: 'deal',
  });
  return dealRound(state, rng);
}

/** Advance to next player (legacy single-card mode). */
export function advanceTurn(
  state: GameState,
  rng: () => number = Math.random
): GameState {
  const deck = [...(state.deck ?? [])];
  const discard = [...(state.discard ?? [])];
  const playerCount = state.settings.playerCount;
  const nextIndex = ((state.currentPlayerIndex ?? 0) + 1) % playerCount;
  const nextCard = drawCard(deck, discard, rng);

  return {
    ...state,
    deck,
    discard,
    currentPlayerIndex: nextIndex,
    currentCard: nextCard ?? undefined,
  };
}

/** Play from hand: play card at handIndex, apply action, advance to next player or end round. */
export function playFromHand(
  state: GameState,
  handIndex: number,
  action: Action,
  rng: () => number = Math.random
): PlayResult {
  const playerIndex = state.currentPlayerIndex ?? 0;
  const hands = state.hands ?? [];
  const hand = hands[playerIndex];
  if (!hand || handIndex < 0 || handIndex >= hand.length) return { state, winner: null, passed: false };

  const card = hand[handIndex];
  const newState = applyAction(state, playerIndex, card, action);
  const winner = checkWin(newState) ? getWinningTeam(newState) : null;
  if (winner !== null) {
    return { state: newState, winner, passed: false };
  }

  const newHands = hands.map((h, i) =>
    i === playerIndex ? h.filter((_, idx) => idx !== handIndex) : h
  );
  const discard = [...(newState.discard ?? []), card];
  const stateAfterPlay = { ...newState, hands: newHands, discard };

  const playerCount = state.settings.playerCount;
  const nextIndex = (playerIndex + 1) % playerCount;
  const firstPlayerNextRound = ((state.dealerIndex ?? 0) + 1) % playerCount;

  if (nextIndex === firstPlayerNextRound) {
    const allHandsEmpty = (stateAfterPlay.hands ?? []).every((h) => !h || h.length === 0);
    if (allHandsEmpty) {
      const roundResult = endRound(stateAfterPlay, rng);
      return { ...roundResult, stateAfterPlay };
    }
  }

  return {
    state: { ...stateAfterPlay, currentPlayerIndex: nextIndex },
    winner: null,
    passed: false,
  };
}

/** Fold: player has no legal move, discard entire hand, advance to next. */
export function foldHand(
  state: GameState,
  rng: () => number = Math.random
): PlayResult {
  const playerIndex = state.currentPlayerIndex ?? 0;
  const hands = (state.hands ?? []).map((h) => [...h]);
  const hand = hands[playerIndex];

  const playerCount = state.settings.playerCount;
  const nextIndex = (playerIndex + 1) % playerCount;
  const firstPlayerNextRound = ((state.dealerIndex ?? 0) + 1) % playerCount;

  if (!hand || hand.length === 0) {
    const stateAfterAdvance = { ...state, currentPlayerIndex: nextIndex };
    if (nextIndex === firstPlayerNextRound) {
      const allHandsEmpty = (state.hands ?? []).every((h) => !h || h.length === 0);
      if (allHandsEmpty) {
        const roundResult = endRound(stateAfterAdvance, rng);
        return { ...roundResult, stateAfterPlay: stateAfterAdvance };
      }
    }
    return { state: stateAfterAdvance, winner: null, passed: true };
  }

  const discard = [...(state.discard ?? []), ...hand];
  hands[playerIndex] = [];
  const foldedThisRound = [...(state.foldedThisRound ?? []), playerIndex];
  const stateAfterFold = { ...state, hands, discard, foldedThisRound };

  if (nextIndex === firstPlayerNextRound) {
    const allHandsEmpty = (stateAfterFold.hands ?? []).every((h) => !h || h.length === 0);
    if (allHandsEmpty) {
      const roundResult = endRound(stateAfterFold, rng);
      return { ...roundResult, stateAfterPlay: stateAfterFold };
    }
  }

  return {
    state: { ...stateAfterFold, currentPlayerIndex: nextIndex },
    winner: null,
    passed: true,
  };
}

/** Pass (no legal move, legacy single-card mode). Discard card, advance turn. */
export function passTurn(
  state: GameState,
  rng: () => number = Math.random
): PlayResult {
  const card = state.currentCard;
  if (!card) return { state, winner: null, passed: true };

  const discard = [...(state.discard ?? []), card];
  const nextState = advanceTurn({ ...state, discard, currentCard: undefined }, rng);

  return { state: nextState, winner: null, passed: true };
}

/** Legacy: play with single drawn card. */
export function playTurn(
  state: GameState,
  action: Action,
  rng: () => number = Math.random
): PlayResult {
  const playerIndex = state.currentPlayerIndex ?? 0;
  const card = state.currentCard;
  if (!card) return { state, winner: null, passed: false };

  const newState = applyAction(state, playerIndex, card, action);
  const discard = [...(newState.discard ?? []), card];
  const nextState = advanceTurn({ ...newState, discard }, rng);

  const winner = checkWin(nextState) ? getWinningTeam(nextState) : null;
  return { state: nextState, winner, passed: false };
}

/** End round: all played. Decrement dealer rounds, rotate if 0, deal next round. */
export function endRound(
  state: GameState,
  rng: () => number = Math.random
): PlayResult {
  let dealerRoundsRemaining = (state.dealerRoundsRemaining ?? 3) - 1;
  let dealerIndex = state.dealerIndex ?? 0;

  if (dealerRoundsRemaining <= 0) {
    dealerIndex = (dealerIndex + 1) % state.settings.playerCount;
    dealerRoundsRemaining = 3;
  }

  const nextState = dealRound(
    { ...state, dealerIndex, dealerRoundsRemaining },
    rng
  );
  return { state: nextState, winner: null, passed: false };
}

/** Get legal actions for current player and card. */
export function getCurrentLegalActions(state: GameState): Action[] {
  const playerIndex = state.currentPlayerIndex ?? 0;
  const card = state.currentCard;
  if (!card) return [];
  return listLegalActions(state, playerIndex, card);
}

/** Get legal actions for current player and a specific card from hand. */
export function getLegalActionsForCard(
  state: GameState,
  playerIndex: number,
  card: Card
): Action[] {
  return listLegalActions(state, playerIndex, card);
}

/** Returns winning team index (partners) or player index (no partners). */
export function getWinningTeam(state: GameState): number {
  const playerCount = state.settings.playerCount;
  const pawnsPerPlayer = state.settings.pawnsPerPlayer;
  const colors = getColorsForPlayerCount(playerCount);

  if (partnersExist(playerCount)) {
    const teamCount = Math.floor(playerCount / 2);
    for (let team = 0; team < teamCount; team++) {
      const c1 = colors[team];
      const partnerIdx = getPartnerIndex(team, playerCount);
      const c2 = partnerIdx >= 0 ? colors[partnerIdx] : null;
      if (!c2) continue;
      const inEnd1 = state.movers.filter((m) => m.color === c1 && m.pos.startsWith(`E_${c1}_`));
      const inEnd2 = state.movers.filter((m) => m.color === c2 && m.pos.startsWith(`E_${c2}_`));
      if (
        inEnd1.length === pawnsPerPlayer && inEnd1.every((m) => m.locked) &&
        inEnd2.length === pawnsPerPlayer && inEnd2.every((m) => m.locked)
      ) return team;
    }
    return 0;
  }

  for (let p = 0; p < playerCount; p++) {
    const color = colors[p];
    const inEnd = state.movers.filter((m) => m.color === color && m.pos.startsWith(`E_${color}_`));
    if (inEnd.length === pawnsPerPlayer && inEnd.every((m) => m.locked)) return p;
  }
  return 0;
}

/**
 * Deck creation and management. x of each card type, where x = playerCount.
 */

import type { Card } from './types.js';
import { NUMBER_CARD_VALUES } from './types.js';
import type { GameSettings } from './types.js';

const CARD_TEMPLATES: Omit<Card, 'value'>[] = [
  { type: 'START' },
  { type: 'START_OR_8' },
  { type: 'START_OR_13' },
  { type: 'FOUR_BACK' },
  { type: 'ONE_OR_14' },
  { type: 'SEVEN_SPLIT' },
  { type: 'SWAP' },
];

/** Create a full deck: playerCount copies of each card type. */
export function createDeck(settings: GameSettings): Card[] {
  const { playerCount } = settings;
  const cards: Card[] = [];

  for (const t of CARD_TEMPLATES) {
    for (let i = 0; i < playerCount; i++) {
      cards.push(t as Card);
    }
  }
  for (const v of NUMBER_CARD_VALUES) {
    for (let i = 0; i < playerCount; i++) {
      cards.push({ type: 'NUMBER', value: v });
    }
  }

  return cards;
}

/** Fisher-Yates shuffle. Mutates array in place. */
export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Draw one card from deck. If deck empty, reshuffle discard into deck first. Mutates deck and discard. */
export function drawCard(deck: Card[], discard: Card[], rng: () => number = Math.random): Card | null {
  if (deck.length === 0) {
    if (discard.length === 0) return null;
    deck.push(...shuffle([...discard], rng));
    discard.length = 0;
  }
  return deck.pop() ?? null;
}

/** Draw N cards from deck. If deck runs out, reshuffles discard and continues. Mutates deck and discard. */
export function drawCards(
  deck: Card[],
  discard: Card[],
  count: number,
  rng: () => number = Math.random
): Card[] {
  const out: Card[] = [];
  for (let i = 0; i < count; i++) {
    const c = drawCard(deck, discard, rng);
    if (c) out.push(c);
  }
  return out;
}

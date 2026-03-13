/**
 * Tile-by-tile animation for replay: animate a move from stateBefore using action.
 */

import type { Action, Card, GameState, NodeId } from '@game/types';
import { getPartnerIndex, getPlayerIndex, partnersExist } from '@game/types';
import { walk } from '@game/moves';
import {
  renderBoard,
  renderCenterCards,
  renderDeck,
  renderPlayerHandsOnBoard,
  renderPlayerHandsWithFlyingCard,
  getDeckCenter,
  getHandCardPosition,
  getCenterPilePosition,
  nodeIdToXY,
  type CenterCard,
  type FlyingCard,
} from '@web-ui/board-renderer';
import type { BoardLayoutConfig } from '@/lib/board-layout-config';

/** Strip originalOwner so border uses current owner (shuffling clears borders). */
function stripOriginalOwner(card: Card): Card {
  const c = card as Card & { originalOwner?: number };
  if (c.originalOwner == null) return card;
  const { originalOwner, ...rest } = c;
  return rest as Card;
}

/** Ease-out cubic: fast start, smooth deceleration at end */
function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** Ease-in-out cubic: slow start, slow end, smooth in the middle */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

type EasingFn = (t: number) => number;

/** Run animation for duration ms, calling onTick(t) each frame with t from 0 to 1. Resolves immediately if signal is aborted. */
function animateOverTime(
  durationMs: number,
  onTick: (t: number) => void,
  signal?: AbortSignal,
  easing: EasingFn = easeOutCubic
): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const start = performance.now();
    function tick(now: number) {
      if (signal?.aborted) {
        resolve();
        return;
      }
      const elapsed = now - start;
      const t = Math.min(1, elapsed / durationMs);
      onTick(easing(t));
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    }
    requestAnimationFrame(tick);
  });
}

/** Delay for ms, resolves immediately if signal is aborted. */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const id = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(id);
      resolve();
    });
  });
}

export interface AnimateReplayOptions {
  /** SVG board element to render into */
  svg: SVGSVGElement;
  /** State before the move */
  stateBefore: GameState;
  /** The action being performed */
  action: Action;
  /** State after the move (needed for bump animation) */
  stateAfter?: GameState;
  /** Bumped pawn info if a knockout occurred */
  bumpedPawn?: { color: string; pawnNum: number };
  /** Board layout config */
  layoutConfig: BoardLayoutConfig;
  /** Center cards to show during animation (e.g. from buildCenterCardsFromHistory) */
  getCenterCards: () => CenterCard[];
  /** Center cards before this move (for card-to-center animation; excludes the played card) */
  getCenterCardsBefore?: () => CenterCard[];
  /** Played card info for card-to-center animation (number, one_or_14, four_back, seven_split) */
  playedCard?: { card: Card; playerColor: string };
  /** Delay in ms per tile step. Default 120. */
  stepDelayMs?: number;
  /** Called after each frame (e.g. applyBoardTransform) */
  onFrame?: () => void;
  /** Player index to highlight (for current player petal). Optional. */
  highlightPlayerIndex?: number | null;
  /** Abort signal to cancel animation when user presses Stop. */
  signal?: AbortSignal;
}

function lerp(a: { x: number; y: number }, b: { x: number; y: number }, t: number): { x: number; y: number } {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function moverIdFromBumped(b: { color: string; pawnNum: number }): string {
  return `${b.color.toLowerCase()}_${b.pawnNum - 1}`;
}

function cardsMatch(a: Card, b: Card): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'NUMBER' && b.type === 'NUMBER') return a.value === b.value;
  return true;
}

function findCardSlotInHand(hand: Card[], card: Card): number {
  return hand.findIndex((c) => cardsMatch(c, card));
}

const CARD_TO_CENTER_BASE_MS = 400;
const CARD_TO_CENTER_DELAY_BASE_MS = 200;

async function runCardToCenterAnimation(opts: {
  svg: SVGSVGElement;
  stateBefore: GameState;
  playedCard: { card: Card; playerColor: string };
  layoutConfig: BoardLayoutConfig;
  getCenterCardsBefore: () => CenterCard[];
  stepDelayMs: number;
  onFrame?: () => void;
  highlightPlayerIndex?: number | null;
  signal?: AbortSignal;
}): Promise<void> {
  const { svg, stateBefore, playedCard, layoutConfig, getCenterCardsBefore, stepDelayMs, onFrame, highlightPlayerIndex, signal } = opts;
  const cardToCenterMs = Math.round(CARD_TO_CENTER_BASE_MS * (stepDelayMs / 400));
  const cardToCenterDelayMs = Math.round(CARD_TO_CENTER_DELAY_BASE_MS * (stepDelayMs / 400));
  const hands = stateBefore.hands;
  if (!hands) return;

  const playerIdx = getPlayerIndex(playedCard.playerColor, layoutConfig.playerCount);
  const hand = hands[playerIdx] ?? [];
  const slot = findCardSlotInHand(hand, playedCard.card);
  if (slot < 0) return;

  const from = getHandCardPosition(layoutConfig, playerIdx, slot, hand.length);
  const to = getCenterPilePosition();
  const playerColor = layoutConfig.playerColors[playerIdx] ?? layoutConfig.playerColors[0];

  const handsWithoutCard: Card[][] = hands.map((h, i) =>
    i === playerIdx ? h.filter((_, j) => j !== slot) : [...h]
  );

  await animateOverTime(cardToCenterMs, (t) => {
    renderBoard(svg, stateBefore, layoutConfig, highlightPlayerIndex);
    renderDeck(svg, stateBefore.deck?.length ?? 0);
    renderCenterCards(svg, getCenterCardsBefore());
    renderPlayerHandsWithFlyingCard(svg, handsWithoutCard, layoutConfig, {
      card: playedCard.card,
      from,
      to,
      t,
      playerColor,
    });
    onFrame?.();
  }, signal);

  await delay(cardToCenterDelayMs, signal);
}

/**
 * Animate a move step-by-step for replay. Handles start, swap, number, four_back, one_or_14, seven_split.
 * Skips animation for fold and meta actions.
 */
export async function animateActionForReplay(opts: AnimateReplayOptions): Promise<void> {
  const {
    svg,
    stateBefore,
    action,
    stateAfter,
    bumpedPawn,
    layoutConfig,
    getCenterCards,
    getCenterCardsBefore,
    playedCard,
    stepDelayMs = 120,
    onFrame,
    highlightPlayerIndex,
    signal,
  } = opts;

  const s = stateBefore;
  const board = s.board;
  const layout = layoutConfig;

  if (action.kind === 'start') {
    const mover = s.movers.find((m) => m.id === action.moverId);
    if (!mover) return;
    const fromPos = nodeIdToXY(mover.pos, board, layout);
    const startNode = `S_${mover.color}` as NodeId;
    const toPos = nodeIdToXY(startNode, board, layout);
    const durationMs = 350;
    await animateOverTime(durationMs, (t) => {
      const overrides = { [action.moverId]: lerp(fromPos, toPos, t) };
      renderBoard(svg, s, layoutConfig, highlightPlayerIndex, overrides);
      renderPlayerHandsOnBoard(svg, s, layoutConfig);
      renderCenterCards(svg, getCenterCards());
      renderDeck(svg, s.deck?.length ?? 0);
      onFrame?.();
    }, signal);
    if (signal?.aborted) return;
    await animateBumpHome();
    return;
  }

  if (action.kind === 'swap') {
    const a = s.movers.find((m) => m.id === action.moverIdA);
    const b = s.movers.find((m) => m.id === action.moverIdB);
    if (!a || !b) return;
    const fromA = nodeIdToXY(a.pos, board, layout);
    const fromB = nodeIdToXY(b.pos, board, layout);
    const durationMs = 400;
    await animateOverTime(durationMs, (t) => {
      const overrides: Record<string, { x: number; y: number }> = {
        [action.moverIdA]: lerp(fromA, fromB, t),
        [action.moverIdB]: lerp(fromB, fromA, t),
      };
      renderBoard(svg, s, layoutConfig, highlightPlayerIndex, overrides);
      renderPlayerHandsOnBoard(svg, s, layoutConfig);
      renderCenterCards(svg, getCenterCards());
      renderDeck(svg, s.deck?.length ?? 0);
      onFrame?.();
    }, signal);
    return;
  }

  async function animateBumpHome(): Promise<void> {
    if (!bumpedPawn || !stateAfter) return;
    const bumpedMoverId = moverIdFromBumped(bumpedPawn);
    const moverBefore = s.movers.find((m) => m.id === bumpedMoverId);
    const moverAfter = stateAfter.movers.find((m) => m.id === bumpedMoverId);
    if (!moverBefore || !moverAfter || !moverAfter.pos.startsWith('H_')) return;
    const fromPos = nodeIdToXY(moverBefore.pos, board, layout);
    const toPos = nodeIdToXY(moverAfter.pos, board, layout);
    const durationMs = 350;
    await animateOverTime(durationMs, (t) => {
      const overrides = { [bumpedMoverId]: lerp(fromPos, toPos, t) };
      renderBoard(svg, stateAfter!, layoutConfig, highlightPlayerIndex, overrides);
      renderPlayerHandsOnBoard(svg, stateAfter!, layoutConfig);
      renderCenterCards(svg, getCenterCards());
      renderDeck(svg, s.deck?.length ?? 0);
      onFrame?.();
    }, signal);
  }

  if (action.kind === 'number' || action.kind === 'one_or_14') {
    if (playedCard && getCenterCardsBefore) {
      await runCardToCenterAnimation({
        svg,
        stateBefore: s,
        playedCard,
        layoutConfig,
        getCenterCardsBefore,
        stepDelayMs,
        onFrame,
        highlightPlayerIndex,
        signal,
      });
    }
    if (signal?.aborted) return;
    const stateForHands = stateAfter && playedCard && getCenterCardsBefore ? stateAfter : s;
    const result = walk(s.board, s.movers, action.moverId, action.steps, 'forward');
    if (!result) return;
    const pathPositions = result.path.map((nodeId) => nodeIdToXY(nodeId, board, layout));
    for (let i = 0; i < pathPositions.length - 1; i++) {
      if (signal?.aborted) return;
      const fromPos = pathPositions[i];
      const toPos = pathPositions[i + 1];
      await animateOverTime(stepDelayMs, (t) => {
        const overrides = { [action.moverId]: lerp(fromPos, toPos, t) };
        renderBoard(svg, s, layoutConfig, highlightPlayerIndex, overrides);
        renderPlayerHandsOnBoard(svg, stateForHands, layoutConfig);
        renderCenterCards(svg, getCenterCards());
        renderDeck(svg, s.deck?.length ?? 0);
        onFrame?.();
      }, signal);
    }
    if (signal?.aborted) return;
    await animateBumpHome();
    return;
  }

  if (action.kind === 'four_back') {
    if (playedCard && getCenterCardsBefore) {
      await runCardToCenterAnimation({
        svg,
        stateBefore: s,
        playedCard,
        layoutConfig,
        getCenterCardsBefore,
        stepDelayMs,
        onFrame,
        highlightPlayerIndex,
        signal,
      });
    }
    if (signal?.aborted) return;
    const stateForHands = stateAfter && playedCard && getCenterCardsBefore ? stateAfter : s;
    const result = walk(s.board, s.movers, action.moverId, 4, 'backward');
    if (!result) return;
    const pathPositions = result.path.map((nodeId) => nodeIdToXY(nodeId, board, layout));
    for (let i = 0; i < pathPositions.length - 1; i++) {
      if (signal?.aborted) return;
      const fromPos = pathPositions[i];
      const toPos = pathPositions[i + 1];
      await animateOverTime(stepDelayMs, (t) => {
        const overrides = { [action.moverId]: lerp(fromPos, toPos, t) };
        renderBoard(svg, s, layoutConfig, highlightPlayerIndex, overrides);
        renderPlayerHandsOnBoard(svg, stateForHands, layoutConfig);
        renderCenterCards(svg, getCenterCards());
        renderDeck(svg, s.deck?.length ?? 0);
        onFrame?.();
      }, signal);
    }
    if (signal?.aborted) return;
    await animateBumpHome();
    return;
  }

  if (action.kind === 'seven_split') {
    if (playedCard && getCenterCardsBefore) {
      await runCardToCenterAnimation({
        svg,
        stateBefore: s,
        playedCard,
        layoutConfig,
        getCenterCardsBefore,
        stepDelayMs,
        onFrame,
        highlightPlayerIndex,
        signal,
      });
    }
    if (signal?.aborted) return;
    const stateForHands = stateAfter && playedCard && getCenterCardsBefore ? stateAfter : s;
    let movers = [...s.movers];
    for (const part of action.parts) {
      if (signal?.aborted) return;
      const result = walk(s.board, movers, part.moverId, part.steps, 'forward');
      if (!result) continue;
      const pathPositions = result.path.map((nodeId) => nodeIdToXY(nodeId, board, layout));
      for (let i = 0; i < pathPositions.length - 1; i++) {
        if (signal?.aborted) return;
        const fromPos = pathPositions[i];
        const toPos = pathPositions[i + 1];
        await animateOverTime(stepDelayMs, (t) => {
          const overrides = { [part.moverId]: lerp(fromPos, toPos, t) };
          renderBoard(svg, { ...s, movers }, layoutConfig, highlightPlayerIndex, overrides);
          renderPlayerHandsOnBoard(svg, { ...stateForHands, movers }, layoutConfig);
          renderCenterCards(svg, getCenterCards());
          renderDeck(svg, s.deck?.length ?? 0);
          onFrame?.();
        }, signal);
      }
      movers = movers.map((m) => (m.id === part.moverId ? { ...m, pos: result.landingNode } : m));
      await animateOverTime(stepDelayMs * 1.5, () => {}, signal); // brief pause between parts
    }
    if (signal?.aborted) return;
    await animateBumpHome();
    return;
  }
}

export interface AnimateDealReplayOptions {
  svg: SVGSVGElement;
  stateBefore: GameState;
  stateAfter: GameState;
  layoutConfig: BoardLayoutConfig;
  getCenterCards: () => CenterCard[];
  stepDelayMs?: number;
  onFrame?: () => void;
  highlightPlayerIndex?: number | null;
  signal?: AbortSignal;
}

/**
 * Animate deal phase: cards fly from deck to each player's hand in round-robin order.
 */
export async function animateDealForReplay(opts: AnimateDealReplayOptions): Promise<void> {
  const {
    svg,
    stateBefore,
    stateAfter,
    layoutConfig,
    getCenterCards,
    stepDelayMs = 120,
    onFrame,
    highlightPlayerIndex,
    signal,
  } = opts;

  const hands = stateAfter.hands;
  if (!hands || hands.length === 0) return;

  const n = hands.length;
  const dealerIndex = stateAfter.dealerIndex ?? 0;
  const totalCards = 4 * n;
  const deckCenter = getDeckCenter();

  /** Build deal sequence: for k in [0..totalCards-1], (playerIdx, slot, card) in round-robin order */
  const dealSequence: { playerIdx: number; slot: number; card: Card }[] = [];
  for (let k = 0; k < totalCards; k++) {
    const playerIdx = (dealerIndex + 1 + k) % n;
    const slot = Math.floor(k / n);
    const card = hands[playerIdx]?.[slot];
    if (card) dealSequence.push({ playerIdx, slot, card });
  }

  /** Build partial hands after dealing cards 0..k-1. Strip originalOwner so borders match current owner. */
  function buildPartialHands(k: number): Card[][] {
    const partial: Card[][] = hands!.map(() => []);
    for (let i = 0; i < k && i < dealSequence.length; i++) {
      const { playerIdx, card } = dealSequence[i];
      partial[playerIdx].push(stripOriginalOwner(card));
    }
    return partial;
  }

  for (let k = 0; k < dealSequence.length; k++) {
    if (signal?.aborted) return;
    const { playerIdx, slot, card } = dealSequence[k];
    const to = getHandCardPosition(layoutConfig, playerIdx, slot, 4);
    const playerColor = layoutConfig.playerColors[playerIdx] ?? layoutConfig.playerColors[0];

    await animateOverTime(stepDelayMs, (t) => {
      const partialHands = buildPartialHands(k);
      renderBoard(svg, stateAfter, layoutConfig, highlightPlayerIndex);
      renderDeck(svg, (stateBefore.deck?.length ?? 0) - k - 1);
      renderCenterCards(svg, getCenterCards());
      renderPlayerHandsWithFlyingCard(svg, partialHands, layoutConfig, {
        card: stripOriginalOwner(card),
        from: deckCenter,
        to,
        t,
        playerColor,
      });
      onFrame?.();
    }, signal);
  }
}

export interface AnimateExchangeReplayOptions {
  svg: SVGSVGElement;
  stateBefore: GameState;
  stateAfter: GameState;
  layoutConfig: BoardLayoutConfig;
  getCenterCards: () => CenterCard[];
  stepDelayMs?: number;
  onFrame?: () => void;
  highlightPlayerIndex?: number | null;
  signal?: AbortSignal;
}

const EXCHANGE_BASE_MS = 600;

/**
 * Animate partner card exchange: cards fly between partners simultaneously.
 */
export async function animateExchangeForReplay(opts: AnimateExchangeReplayOptions): Promise<void> {
  const {
    svg,
    stateBefore,
    stateAfter,
    layoutConfig,
    getCenterCards,
    stepDelayMs = 120,
    onFrame,
    highlightPlayerIndex,
    signal,
  } = opts;

  const playerCount = stateBefore.settings?.playerCount ?? 4;
  if (!partnersExist(playerCount)) return;

  const handsBefore = stateBefore.hands;
  const handsAfter = stateAfter.hands;
  if (!handsBefore || !handsAfter) return;

  const teamCount = Math.floor(playerCount / 2);
  const swaps: { p: number; partner: number; idxP: number; idxPartner: number; cardP: Card; cardPartner: Card }[] = [];

  for (let p = 0; p < teamCount; p++) {
    const partner = getPartnerIndex(p, playerCount);
    if (partner < 0) continue;

    const idxP = handsAfter[p]?.findIndex((c) => (c as { originalOwner?: number }).originalOwner === partner) ?? -1;
    const idxPartner = handsAfter[partner]?.findIndex((c) => (c as { originalOwner?: number }).originalOwner === p) ?? -1;
    if (idxP < 0 || idxPartner < 0) continue;

    const cardP = handsBefore[p]?.[idxP];
    const cardPartner = handsBefore[partner]?.[idxPartner];
    if (!cardP || !cardPartner) continue;

    swaps.push({ p, partner, idxP, idxPartner, cardP, cardPartner });
  }

  if (swaps.length === 0) return;

  const durationMs = Math.round(EXCHANGE_BASE_MS * (stepDelayMs / 400));
  const colorP = (idx: number) => layoutConfig.playerColors[idx] ?? layoutConfig.playerColors[0];

  await animateOverTime(durationMs, (t) => {
    const flyingCards: FlyingCard[] = [];
    const partialHands: (Card | null)[][] = handsBefore.map((h) => {
      const arr = [...(h ?? [])];
      while (arr.length < 4) arr.push(null as unknown as Card);
      return arr;
    });

    for (const { p, partner, idxP, idxPartner, cardP, cardPartner } of swaps) {
      const fromP = getHandCardPosition(layoutConfig, p, idxP, 4);
      const toP = getHandCardPosition(layoutConfig, partner, idxPartner, 4);
      const fromPartner = getHandCardPosition(layoutConfig, partner, idxPartner, 4);
      const toPartner = getHandCardPosition(layoutConfig, p, idxP, 4);

      flyingCards.push(
        { card: cardP, from: fromP, to: toP, t, playerColor: colorP(p) },
        { card: cardPartner, from: fromPartner, to: toPartner, t, playerColor: colorP(partner) }
      );

      partialHands[p][idxP] = null as unknown as Card;
      partialHands[partner][idxPartner] = null as unknown as Card;
    }

    renderBoard(svg, stateBefore, layoutConfig, highlightPlayerIndex);
    renderDeck(svg, stateBefore.deck?.length ?? 0);
    renderCenterCards(svg, getCenterCards());
    renderPlayerHandsWithFlyingCard(svg, partialHands, layoutConfig, flyingCards);
    onFrame?.();
  }, signal, easeInOutCubic);
}

export interface AnimateFoldReplayOptions {
  svg: SVGSVGElement;
  stateBefore: GameState;
  stateAfter: GameState;
  layoutConfig: BoardLayoutConfig;
  getCenterCards: () => CenterCard[];
  playerColor: string;
  stepDelayMs?: number;
  onFrame?: () => void;
  highlightPlayerIndex?: number | null;
  signal?: AbortSignal;
}

const FOLD_BASE_MS = 350;

/**
 * Animate fold: player's cards fly from hand to center pile one at a time.
 */
export async function animateFoldForReplay(opts: AnimateFoldReplayOptions): Promise<void> {
  const {
    svg,
    stateBefore,
    stateAfter,
    layoutConfig,
    getCenterCards,
    playerColor,
    stepDelayMs = 120,
    onFrame,
    highlightPlayerIndex,
    signal,
  } = opts;

  const handsBefore = stateBefore.hands;
  if (!handsBefore) return;

  const playerIdx = getPlayerIndex(playerColor, layoutConfig.playerCount);
  const hand = handsBefore[playerIdx] ?? [];
  if (hand.length === 0) return;

  const centerPos = getCenterPilePosition();
  const colorHex = layoutConfig.playerColors[playerIdx] ?? layoutConfig.playerColors[0];
  const durationMs = Math.round(FOLD_BASE_MS * (stepDelayMs / 400));

  for (let i = 0; i < hand.length; i++) {
    if (signal?.aborted) return;
    const card = hand[i];
    const from = getHandCardPosition(layoutConfig, playerIdx, i, hand.length);
    const partialHands = handsBefore.map((h, p) =>
      p === playerIdx ? hand.slice(0, i) : [...(h ?? [])]
    );

    await animateOverTime(durationMs, (t) => {
      renderBoard(svg, stateBefore, layoutConfig, highlightPlayerIndex);
      renderDeck(svg, stateBefore.deck?.length ?? 0);
      renderCenterCards(svg, getCenterCards());
      renderPlayerHandsWithFlyingCard(svg, partialHands, layoutConfig, {
        card,
        from,
        to: centerPos,
        t,
        playerColor: colorHex,
      });
      onFrame?.();
    }, signal, easeInOutCubic);
  }
}

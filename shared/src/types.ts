/**
 * PARTNERS board game – core types.
 * Board is a graph with spur nodes; node IDs and movers.
 */

export const COLORS = ['BLUE', 'RED', 'GREEN', 'YELLOW'] as const;
export type Color = (typeof COLORS)[number];

/** Extended palette for 6+ players. 18 colors for up to 18 players. */
export const COLORS_PALETTE = [
  'RED', 'YELLOW', 'GREEN', 'BLUE', 'ORANGE', 'PURPLE',
  'CYAN', 'MAGENTA', 'PINK', 'LIME', 'TEAL', 'NAVY',
  'CORAL', 'MAROON', 'OLIVE', 'INDIGO', 'AMBER', 'MINT',
] as const;
export type ExtendedColor = (typeof COLORS_PALETTE)[number];

/** Shuffle mode: 'always' = dealer shuffles every round; 'when_needed' = only when deck insufficient to deal. */
export type ShuffleMode = 'always' | 'when_needed';

/** Game creation parameters. Standard is (4, 4, 14). */
export interface GameSettings {
  playerCount: number;
  pawnsPerPlayer: number;
  trackTilesPerPlayer: number;
  /** Default 'always' for standard rules. 'when_needed' for card-counting mode. */
  shuffleMode?: ShuffleMode;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  playerCount: 4,
  pawnsPerPlayer: 4,
  trackTilesPerPlayer: 14,
  shuffleMode: 'always',
};

/** Colors for the first N players. */
export function getColorsForPlayerCount(n: number): readonly string[] {
  return COLORS_PALETTE.slice(0, Math.min(n, COLORS_PALETTE.length));
}

export type NodeId =
  | `T${number}`
  | `S_${string}`
  | `E_${string}_${number}`
  | `H_${string}_${number}`;

export interface Mover {
  id: string;
  color: string;
  pos: NodeId;
  /** Once true, the pawn is permanently placed in the end zone and cannot be moved. */
  locked?: boolean;
}

/** Card types from written rules. Deck is a configurable multiset. */
export type Card =
  | { type: 'NUMBER'; value: number; originalOwner?: number }
  | { type: 'START'; originalOwner?: number }
  | { type: 'START_OR_8'; originalOwner?: number }
  | { type: 'START_OR_13'; originalOwner?: number }
  | { type: 'FOUR_BACK'; originalOwner?: number }
  | { type: 'ONE_OR_14'; originalOwner?: number }
  | { type: 'SEVEN_SPLIT'; originalOwner?: number }
  | { type: 'SWAP'; originalOwner?: number };

export const NUMBER_CARD_VALUES = [2, 3, 5, 6, 9, 10, 12] as const;

/** Per-color board indices: beforeStart = track node before heart, afterStart = track node after heart. */
export interface ColorBoardConfig {
  beforeStartIndex: number;
  afterStartIndex: number;
  /** Main track index where forward movement enters this color's end zone. */
  endEntryIndex: number;
}

export interface BoardConfig {
  mainTrackLength: number;
  /** Number of end zone slots per color (usually = pawnsPerPlayer). */
  endZoneSlots?: number;
  colors: Record<string, ColorBoardConfig>;
}

/** Round phase: deal -> exchange -> play. */
export type RoundPhase = 'deal' | 'exchange' | 'play';

export interface GameState {
  movers: Mover[];
  board: BoardConfig;
  settings: GameSettings;
  /** 0..playerCount-1; partners are (i + playerCount/2) % playerCount */
  currentPlayerIndex?: number;
  /** Remaining cards to draw. */
  deck?: Card[];
  /** Discarded/played cards; reshuffled into deck when deck empties. */
  discard?: Card[];
  /** Card the current player must play this turn (legacy: single-card mode). */
  currentCard?: Card | null;

  /** Hands per player: hands[playerIndex] = that player's cards. */
  hands?: Card[][];
  /** Dealer player index. */
  dealerIndex?: number;
  /** Rounds remaining for current dealer (3, 2, 1). After 0, rotate dealer. */
  dealerRoundsRemaining?: number;
  /** Current round phase. */
  roundPhase?: RoundPhase;
  /** Exchange: index of card each player will trade with partner. null = not yet selected. */
  exchangeSelection?: (number | null)[];
  /** Whether the most recent deal included a shuffle (set by dealRound). */
  shuffledThisRound?: boolean;
  /** Player indices who folded this round (discarded hand, no play). Cleared on deal. */
  foldedThisRound?: number[];
}

/** Actions returned by listLegalActions; consumed by applyAction. */
export type Action =
  | { kind: 'start'; moverId: string }
  | { kind: 'number'; moverId: string; steps: number }
  | { kind: 'four_back'; moverId: string }
  | { kind: 'one_or_14'; moverId: string; steps: 1 | 14 }
  | { kind: 'seven_split'; parts: { moverId: string; steps: number }[] }
  | { kind: 'swap'; moverIdA: string; moverIdB: string };

/** Player index = turn order (clockwise on board): 0=RED, 1=YELLOW, 2=GREEN, 3=BLUE. Partners are opposite seats. */
export const DEFAULT_PLAYER_COLORS: Record<number, Color> = {
  0: 'RED',
  1: 'YELLOW',
  2: 'GREEN',
  3: 'BLUE',
};

/** Partners exist if and only if playerCount is even and >= 4. */
export function partnersExist(playerCount: number): boolean {
  return playerCount >= 4 && playerCount % 2 === 0;
}

/** Returns partner index, or -1 if no partners (2 players or odd count). */
export function getPartnerIndex(playerIndex: number, playerCount: number = 4): number {
  if (!partnersExist(playerCount)) return -1;
  return (playerIndex + Math.floor(playerCount / 2)) % playerCount;
}

export function getPlayerIndex(color: string, playerCount: number): number {
  const colors = getColorsForPlayerCount(playerCount);
  const idx = colors.indexOf(color);
  return idx >= 0 ? idx : 0;
}

export function isPartner(colorA: string, colorB: string, playerCount: number = 4): boolean {
  if (!partnersExist(playerCount)) return false;
  return getPartnerIndex(getPlayerIndex(colorA, playerCount), playerCount) === getPlayerIndex(colorB, playerCount);
}

export function isOpponent(colorA: string, colorB: string, playerCount: number = 4): boolean {
  return colorA !== colorB && !isPartner(colorA, colorB, playerCount);
}

/**
 * Default game state and state helpers. Used by web UI and tests; no test-only code.
 */

import type { GameState, Mover } from './types.js';
import { COLORS, getColorsForPlayerCount } from './types.js';
import type { GameSettings } from './types.js';
import { createDefaultBoardConfig, createBoardConfigFromSettings } from './board-config.js';

export function createMovers(): Mover[] {
  return createMoversFromSettings({ playerCount: 4, pawnsPerPlayer: 4, trackTilesPerPlayer: 14 });
}

export function createMoversFromSettings(settings: GameSettings): Mover[] {
  const { playerCount, pawnsPerPlayer } = settings;
  const colors = getColorsForPlayerCount(playerCount);
  const movers: Mover[] = [];
  for (const c of colors) {
    for (let i = 0; i < pawnsPerPlayer; i++) {
      movers.push({ id: `${c.toLowerCase()}_${i}`, color: c, pos: `H_${c}_${i}` as Mover['pos'] });
    }
  }
  return movers;
}

export function placeMover(movers: Mover[], moverId: string, pos: Mover['pos']): Mover[] {
  return movers.map((m) => (m.id === moverId ? { ...m, pos } : m));
}

export function lockMover(movers: Mover[], moverId: string): Mover[] {
  return movers.map((m) => (m.id === moverId ? { ...m, locked: true } : m));
}

export function createGameStateFromSettings(settings: GameSettings, overrides?: Partial<GameState>): GameState {
  return {
    movers: createMoversFromSettings(settings),
    board: createBoardConfigFromSettings(settings),
    settings,
    currentPlayerIndex: 0,
    ...overrides,
  };
}

export function createDefaultGameState(overrides?: Partial<GameState>): GameState {
  const settings = { playerCount: 4, pawnsPerPlayer: 4, trackTilesPerPlayer: 14 };
  return {
    movers: createMovers(),
    board: createDefaultBoardConfig(),
    settings,
    ...overrides,
  };
}

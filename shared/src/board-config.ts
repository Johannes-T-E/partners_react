/**
 * Canonical board layout from game rules.
 * Single source of truth for the board; no dependency on test code.
 */

import type { BoardConfig } from './types.js';
import { getColorsForPlayerCount } from './types.js';
import type { GameSettings } from './types.js';

export const TRACKS_PER_STREET = 14;
export const DEFAULT_MAIN_TRACK_LENGTH = TRACKS_PER_STREET * 4; // 56

/**
 * Builds board config from game settings.
 * Main track length = playerCount * trackTilesPerPlayer.
 * Colors are placed clockwise around the track; each color's start is after the previous color's segment.
 */
export function createBoardConfigFromSettings(settings: GameSettings): BoardConfig {
  const { playerCount, trackTilesPerPlayer } = settings;
  const N = playerCount * trackTilesPerPlayer;
  const colors = getColorsForPlayerCount(playerCount);
  const colorConfig: Record<string, { beforeStartIndex: number; afterStartIndex: number; endEntryIndex: number }> = {};

  for (let i = 0; i < playerCount; i++) {
    const color = colors[i];
    const beforeStartIndex = (i * trackTilesPerPlayer + N - 1) % N;
    const afterStartIndex = (i * trackTilesPerPlayer) % N;
    colorConfig[color] = {
      beforeStartIndex,
      afterStartIndex,
      endEntryIndex: beforeStartIndex,
    };
  }

  return {
    mainTrackLength: N,
    endZoneSlots: settings.pawnsPerPlayer,
    colors: colorConfig,
  };
}

/**
 * Builds the default board config (56 tracks, clockwise Red → Yellow → Green → Blue).
 * Each color completes a full path: end zone is entered at the tile just before their start.
 * Per-color: afterStart = first tile out of start, beforeStart = last tile before start (full lap), endEntry = beforeStart.
 */
export function createDefaultBoardConfig(overrides?: Partial<BoardConfig>): BoardConfig {
  const N = DEFAULT_MAIN_TRACK_LENGTH;
  const board: BoardConfig = {
    mainTrackLength: N,
    colors: {
      RED: { beforeStartIndex: 55, afterStartIndex: 0, endEntryIndex: 55 },
      YELLOW: { beforeStartIndex: 13, afterStartIndex: 14, endEntryIndex: 13 },
      GREEN: { beforeStartIndex: 27, afterStartIndex: 28, endEntryIndex: 27 },
      BLUE: { beforeStartIndex: 41, afterStartIndex: 42, endEntryIndex: 41 },
    },
    ...overrides,
  };
  return board;
}

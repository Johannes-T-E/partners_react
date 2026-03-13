import type { NodeId } from '@game/types';
import type { GameResultWithHistory } from '@game/simulation';
import { parseNodeId } from '@game/board';
import { getPlayerIndex } from '@game/types';
import type { BoardConfig } from '@game/types';
import type { BoardLayoutConfig } from './board-layout-config';
import { getCircleTileCount, getStartCircleIndices, getTrackSegmentsOrdered } from './board-layout-config';

/** Aggregate pawn visit counts per board position from all games. */
export function computeVisitCounts(games: GameResultWithHistory[]): Map<NodeId, number> {
  const counts = new Map<NodeId, number>();
  for (const game of games) {
    for (const entry of game.history) {
      const state = entry.state;
      if (!state?.movers) continue;
      for (const mover of state.movers) {
        const pos = mover.pos;
        counts.set(pos, (counts.get(pos) ?? 0) + 1);
      }
    }
  }
  return counts;
}

/** Map node to circle segment index. */
function nodeToSegmentIndex(
  nodeId: NodeId,
  board: BoardConfig,
  layout: BoardLayoutConfig
): number | null {
  const p = parseNodeId(nodeId);
  if (!p) return null;
  const circleTiles = getCircleTileCount(layout);
  const startIndices = getStartCircleIndices(layout);
  const trackSegments = getTrackSegmentsOrdered(layout);

  if (p.kind === 'T') {
    const idx = Math.min(
      Math.round((p.index * trackSegments.length) / board.mainTrackLength),
      trackSegments.length - 1
    );
    return trackSegments[idx];
  }
  if (p.kind === 'S') {
    const pi = getPlayerIndex(p.color, layout.playerCount);
    return startIndices[pi] ?? 0;
  }
  // E (end zone) nodes are separate physical locations — don't map to track entrance.
  // Mapping them inflated the entrance tile artificially.
  if (p.kind === 'E') return null;
  if (p.kind === 'H' && p.slot !== undefined) {
    const pi = getPlayerIndex(p.color, layout.playerCount);
    return startIndices[pi] ?? 0;
  }
  return null;
}

/** Aggregate pawn visit counts per circle segment (for full-tile heatmap). */
export function computeSegmentVisitCounts(
  games: GameResultWithHistory[],
  board: BoardConfig,
  layout: BoardLayoutConfig
): number[] {
  const circleTiles = getCircleTileCount(layout);
  const counts = new Array(circleTiles).fill(0);
  for (const game of games) {
    for (const entry of game.history) {
      const state = entry.state;
      if (!state?.movers) continue;
      for (const mover of state.movers) {
        const seg = nodeToSegmentIndex(mover.pos, board, layout);
        if (seg !== null && seg >= 0 && seg < circleTiles) counts[seg]++;
      }
    }
  }
  return counts;
}

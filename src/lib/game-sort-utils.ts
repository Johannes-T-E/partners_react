import type { GameResultWithHistory, HistoryEntry } from '@game/simulation';
import { isOpponent } from '@game/types';

type SevenSplitEntry = HistoryEntry & { action: { kind: 'seven_split'; parts: { moverId: string; steps: number }[] } };

/** Count opponent pawns sent home by this move (from state comparison). */
function countKnockouts(
  stateBefore: { movers: { id: string; pos: string; color: string }[]; settings?: { playerCount?: number } },
  stateAfter: { movers: { id: string; pos: string; color: string }[] },
  movingColor: string,
): number {
  const playerCount = stateBefore.settings?.playerCount ?? 4;
  let count = 0;
  for (const m of stateAfter.movers) {
    if (!m.pos.startsWith('H_')) continue;
    const before = stateBefore.movers.find((x) => x.id === m.id);
    if (!before || before.pos.startsWith('H_')) continue;
    if (isOpponent(m.color, movingColor, playerCount)) count++;
  }
  return count;
}

/**
 * Score a single 7 split move.
 * 10/pawn + 40/lock + 50/knockout. Double KO > lock+KO: +160 for 2+ KOs, +150 for lock+1KO.
 */
function scoreSingleSevenSplit(
  entry: { action: { kind: string; parts: { moverId: string; steps: number }[] }; moveTypes?: string[]; bumpedPawn?: { color: string; pawnNum: number } | null; playerColor?: string; state?: { movers: { id: string; pos: string; color: string }[]; settings?: { playerCount?: number } } },
  stateBefore?: { movers: { id: string; pos: string; color: string }[]; settings?: { playerCount?: number } },
): number {
  const parts = entry.action.parts.length;
  const hasLock = (entry.moveTypes ?? []).includes('lock');
  const koCount = stateBefore && entry.state && entry.playerColor
    ? countKnockouts(stateBefore, entry.state, entry.playerColor)
    : (entry.bumpedPawn != null ? 1 : 0);
  let score = 10 * parts + (hasLock ? 40 : 0) + 50 * koCount;
  if (koCount >= 2) score += 160; // double+ KO beats lock+single KO
  else if (hasLock && koCount >= 1) score += 150; // lock+KO bonus
  return score;
}

/**
 * Score a game by "interesting" 7 split plays.
 * Uses sum of squared per-move scores to favor quality over quantity.
 */
export function computeSevenSplitScore(game: GameResultWithHistory): number {
  let total = 0;
  for (let i = 0; i < game.history.length; i++) {
    const e = game.history[i];
    if (typeof e.action !== 'object' || e.action.kind !== 'seven_split') continue;
    const stateBefore = i > 0 ? game.history[i - 1].state : undefined;
    const s = scoreSingleSevenSplit(e as SevenSplitEntry, stateBefore);
    total += s * s;
  }
  return total;
}

/** Raw sum of per-move scores (for display). */
export function computeSevenSplitScoreDisplay(game: GameResultWithHistory): number {
  let total = 0;
  for (let i = 0; i < game.history.length; i++) {
    const e = game.history[i];
    if (typeof e.action !== 'object' || e.action.kind !== 'seven_split') continue;
    const stateBefore = i > 0 ? game.history[i - 1].state : undefined;
    total += scoreSingleSevenSplit(e as SevenSplitEntry, stateBefore);
  }
  return total;
}

/** Best single 7 split score in the game (for "most impressive individual split" sort). */
export function computeSevenSplitBestScore(game: GameResultWithHistory): number {
  let best = 0;
  for (let i = 0; i < game.history.length; i++) {
    const e = game.history[i];
    if (typeof e.action !== 'object' || e.action.kind !== 'seven_split') continue;
    const stateBefore = i > 0 ? game.history[i - 1].state : undefined;
    const s = scoreSingleSevenSplit(e as SevenSplitEntry, stateBefore);
    if (s > best) best = s;
  }
  return best;
}

import { getUsedValue } from '@web-ui/board-renderer';
import { getColorHex } from './color-utils';
import type { HistoryEntry } from '@game/simulation';
import type { CenterCard } from '@web-ui/board-renderer';

export function buildCenterCardsFromHistory(entries: HistoryEntry[], upToIndex: number): CenterCard[] {
  let result: CenterCard[] = [];
  for (let i = 0; i <= upToIndex && i < entries.length; i++) {
    const e = entries[i];
    if (e.action === 'shuffle') result = [];
    if (e.action === 'deal') continue;
    if (e.action === 'fold') {
      const prevState = i > 0 ? entries[i - 1].state : undefined;
      const hand = prevState?.hands?.[prevState.currentPlayerIndex ?? 0] ?? [];
      const hex = e.playerColor ? getColorHex(e.playerColor) : '#95a5a6';
      for (const card of hand) {
        result.push({ card, playerColor: hex, usedValue: undefined });
      }
      continue;
    }
    if (e.card && e.action !== 'shuffle') {
      const hex = e.playerColor ? getColorHex(e.playerColor) : '#95a5a6';
      result.push({ card: e.card, playerColor: hex, usedValue: getUsedValue(e.card, e.action) });
    }
  }
  return result;
}

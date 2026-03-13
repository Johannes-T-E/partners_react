/**
 * Win condition: team (both partners) or single player has all pawns locked.
 */
import type { GameState } from './types.js';
import { getColorsForPlayerCount, getPartnerIndex, partnersExist } from './types.js';

export function checkWin(state: GameState): boolean {
  const playerCount = state.settings?.playerCount ?? 4;
  const pawnsPerPlayer = state.settings?.pawnsPerPlayer ?? 4;
  const colors = getColorsForPlayerCount(playerCount);

  if (partnersExist(playerCount)) {
    const teamCount = Math.floor(playerCount / 2);
    for (let team = 0; team < teamCount; team++) {
      const color1 = colors[team];
      const partnerIdx = getPartnerIndex(team, playerCount);
      const color2 = partnerIdx >= 0 ? colors[partnerIdx] : null;
      if (!color2) continue;
      const inEnd1 = state.movers.filter((m) => m.color === color1 && m.pos.startsWith(`E_${color1}_`));
      const inEnd2 = state.movers.filter((m) => m.color === color2 && m.pos.startsWith(`E_${color2}_`));
      if (
        inEnd1.length === pawnsPerPlayer && inEnd1.every((m) => m.locked) &&
        inEnd2.length === pawnsPerPlayer && inEnd2.every((m) => m.locked)
      ) return true;
    }
    return false;
  }

  for (let p = 0; p < playerCount; p++) {
    const color = colors[p];
    const inEnd = state.movers.filter((m) => m.color === color && m.pos.startsWith(`E_${color}_`));
    if (inEnd.length === pawnsPerPlayer && inEnd.every((m) => m.locked)) return true;
  }
  return false;
}

import { useState, useMemo } from 'react';
import type { GameResultWithHistory } from '@game/simulation';
import { computeSingleGameStats } from '@game/simulation';
import { getColorsForPlayerCount, partnersExist, getPartnerIndex } from '@game/index';
import { getColorHex } from '@/lib/color-utils';
import { computeSevenSplitScore, computeSevenSplitScoreDisplay, computeSevenSplitBestScore } from '@/lib/game-sort-utils';

type SortBy = 'default' | 'knockouts' | 'sevenSplit' | 'sevenSplitBest' | 'locks' | 'turnsAsc' | 'turnsDesc';

function colorAbbrev(color: string): string {
  return color ? color.charAt(0).toUpperCase() : '?';
}

function getTeamColors(winner: number, playerCount: number): string[] {
  const colors = getColorsForPlayerCount(playerCount);
  if (partnersExist(playerCount)) {
    const partnerIdx = getPartnerIndex(winner, playerCount);
    return partnerIdx >= 0 ? [colors[winner], colors[partnerIdx]] : [colors[winner]];
  }
  return [colors[winner]];
}

function getWinnerLabel(winner: number, playerCount: number, aliases?: string[]): string {
  const colors = getColorsForPlayerCount(playerCount);
  if (partnersExist(playerCount)) {
    const firstPlayerOfTeam = winner * (playerCount / 2);
    const alias = aliases?.[firstPlayerOfTeam]?.trim();
    if (alias) return alias;
    const partnerIdx = getPartnerIndex(winner, playerCount);
    const c1 = colors[winner];
    const c2 = partnerIdx >= 0 ? colors[partnerIdx] : null;
    return c2 ? `${colorAbbrev(c1 ?? '')}+${colorAbbrev(c2)}` : `Team ${winner + 1}`;
  }
  const alias = aliases?.[winner]?.trim();
  if (alias) return alias;
  return colorAbbrev(colors[winner] ?? '');
}

export interface SimulationResultsGamesProps {
  games: GameResultWithHistory[];
  playerCount: number;
  playerAliases: string[];
  selectedGameIndex: number | null;
  selectedGameIndices?: number[];
  onGameClick: (index: number, metaKey?: boolean) => void;
  onReplayClick?: () => void;
  /** Export full simulation (e.g. on Replay page). On Simulation page, Export is in the results header. */
  onExportClick?: () => void;
  /** Hide the Replay button (e.g. when already on Replay page). */
  hideReplayButton?: boolean;
  /** When on Replay page: jump to last move when selecting a game. */
  lockLast?: boolean;
  onLockLastChange?: (value: boolean) => void;
}

export default function SimulationResultsGames({
  games,
  playerCount,
  playerAliases,
  selectedGameIndex,
  selectedGameIndices = [],
  onGameClick,
  onReplayClick,
  onExportClick,
  hideReplayButton = false,
  lockLast,
  onLockLastChange,
}: SimulationResultsGamesProps) {
  const [sortBy, setSortBy] = useState<SortBy>('default');

  const sortedGames = useMemo(() => {
    const withIndices = games.map((g, i) => ({ game: g, originalIndex: i }));
    if (sortBy === 'default') return withIndices;
    return [...withIndices].sort((a, b) => {
      if (sortBy === 'knockouts') {
        const ka = computeSingleGameStats(a.game, playerCount).knockouts;
        const kb = computeSingleGameStats(b.game, playerCount).knockouts;
        return kb - ka;
      }
      if (sortBy === 'sevenSplit') {
        return computeSevenSplitScore(b.game) - computeSevenSplitScore(a.game);
      }
      if (sortBy === 'sevenSplitBest') {
        return computeSevenSplitBestScore(b.game) - computeSevenSplitBestScore(a.game);
      }
      if (sortBy === 'locks') {
        const la = computeSingleGameStats(a.game, playerCount).locks;
        const lb = computeSingleGameStats(b.game, playerCount).locks;
        return lb - la;
      }
      if (sortBy === 'turnsAsc') return a.game.turns - b.game.turns;
      if (sortBy === 'turnsDesc') return b.game.turns - a.game.turns;
      return 0;
    });
  }, [games, playerCount, sortBy]);

  const selectedGame = selectedGameIndex !== null ? games[selectedGameIndex] : null;
  const gameStats = selectedGame ? computeSingleGameStats(selectedGame, playerCount) : null;

  return (
    <div className="sim-results-games">
      <div className="sim-results-games-title">Games ({games.length} available)</div>
      <div className="sim-results-games-sort">
        <label htmlFor="game-sort">Sort by</label>
        <select
          id="game-sort"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="sim-results-games-sort-select"
        >
          <option value="default">Default</option>
          <option value="knockouts">Most knockouts</option>
          <option value="sevenSplit">Most interesting 7 splits</option>
          <option value="sevenSplitBest">Best single 7 split</option>
          <option value="locks">Most locks</option>
          <option value="turnsAsc">Shortest games</option>
          <option value="turnsDesc">Longest games</option>
        </select>
      </div>
      {onLockLastChange != null && (
        <div className="control">
          <label>
            <input type="checkbox" checked={lockLast ?? false} onChange={(e) => onLockLastChange(e.target.checked)} />
            Always jump to last move
          </label>
        </div>
      )}
      <div className="game-list custom-scrollbar">
        {sortedGames.map(({ game, originalIndex }) => {
          const winner = game.winner;
          const teamColors = winner !== null ? getTeamColors(winner, playerCount) : [];
          return (
            <div
              key={originalIndex}
              className={`game-list-item game-list-item--${selectedGameIndex === originalIndex ? 'selected' : ''}${selectedGameIndices.includes(originalIndex) ? ' game-list-item--in-selection' : ''}`}
              onClick={(e) => onGameClick(originalIndex, e.metaKey)}
            >
              <span className="game-list-item-num">{originalIndex + 1}</span>
              {winner !== null ? (
                <>
                  <span className="sim-wins-legend-swatches">
                    {teamColors.map((c, j) => (
                      <span key={j} className="sim-win-swatch" style={{ backgroundColor: getColorHex(c ?? 'GRAY') }} />
                    ))}
                  </span>
                  <span className="game-list-item-winner">{getWinnerLabel(winner, playerCount, playerAliases)}</span>
                </>
              ) : (
                <span className="game-list-item-winner">Draw</span>
              )}
              <span className="game-list-item-turns">({game.turns} turns)</span>
              {(sortBy === 'sevenSplit' || sortBy === 'sevenSplitBest') && (
                <span className="game-list-item-score" title={sortBy === 'sevenSplit' ? '7 split interest score (total)' : 'Best single 7 split score'}>
                  {sortBy === 'sevenSplit' ? computeSevenSplitScoreDisplay(game) : computeSevenSplitBestScore(game)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {selectedGame && gameStats && (
        <div className="sim-game-detail">
          <h4 className="sim-results-section-title">Game {selectedGameIndex! + 1}</h4>
          <div className="sim-game-detail-grid">
            <div className="sim-game-detail-item">
              <span className="sim-game-detail-label">Winner</span>
              <span className="sim-game-detail-val sim-game-detail-winner">
                {selectedGame.winner !== null ? (
                  <>
                    <span className="sim-wins-legend-swatches">
                      {getTeamColors(selectedGame.winner, playerCount).map((c, j) => (
                        <span key={j} className="sim-win-swatch" style={{ backgroundColor: getColorHex(c ?? 'GRAY') }} />
                      ))}
                    </span>
                    {getWinnerLabel(selectedGame.winner, playerCount, playerAliases)}
                  </>
                ) : (
                  'Draw'
                )}
              </span>
            </div>
            <div className="sim-game-detail-item">
              <span className="sim-game-detail-label">Turns</span>
              <span className="sim-game-detail-val sim-game-detail-val-num">{selectedGame.turns}</span>
            </div>
            <div className="sim-game-detail-item">
              <span className="sim-game-detail-label">Knockouts</span>
              <span className="sim-game-detail-val sim-game-detail-val-num">{gameStats.knockouts}</span>
            </div>
            <div className="sim-game-detail-item">
              <span className="sim-game-detail-label">Folds</span>
              <span className="sim-game-detail-val sim-game-detail-val-num">{gameStats.folds}</span>
            </div>
            <div className="sim-game-detail-item">
              <span className="sim-game-detail-label">Locks</span>
              <span className="sim-game-detail-val sim-game-detail-val-num">{gameStats.locks}</span>
            </div>
            <div className="sim-game-detail-item">
              <span className="sim-game-detail-label">Swaps</span>
              <span className="sim-game-detail-val sim-game-detail-val-num">{gameStats.swaps}</span>
            </div>
            <div className="sim-game-detail-item">
              <span className="sim-game-detail-label">Rounds</span>
              <span className="sim-game-detail-val sim-game-detail-val-num">{gameStats.rounds}</span>
            </div>
          </div>
          <div className="sim-game-detail-actions">
            {!hideReplayButton && onReplayClick && (
              <button type="button" className="sim-btn-replay" onClick={onReplayClick}>
                Replay
              </button>
            )}
            {onExportClick && (
              <button type="button" className="sim-btn-export" onClick={onExportClick}>
                Export simulation
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

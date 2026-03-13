import { useState, useMemo } from 'react';
import type { SimulationResult } from '@game/simulation';
import { computeHistoryStats } from '@game/simulation';
import type { GameResultWithHistory } from '@game/simulation';
import { getColorsForPlayerCount, partnersExist, getPartnerIndex, createGameStateFromSettings } from '@game/index';
import { getColorHex } from '@/lib/color-utils';
import { computeSegmentVisitCounts } from '@/lib/heatmap-utils';
import { Chart } from 'react-chartjs-2';
import { Board } from '@/components/Board';
import type { GameSettings } from '@game/types';
import { getStartCircleIndices, type BoardLayoutConfig } from '@/lib/board-layout-config';

function getWinnerLabel(winner: number, playerCount: number, aliases?: string[]): string {
  const colors = getColorsForPlayerCount(playerCount);
  if (partnersExist(playerCount)) {
    const firstPlayerOfTeam = winner * (playerCount / 2);
    const alias = aliases?.[firstPlayerOfTeam]?.trim();
    if (alias) return alias;
    const partnerIdx = getPartnerIndex(winner, playerCount);
    const c1 = colors[winner];
    const c2 = partnerIdx >= 0 ? colors[partnerIdx] : null;
    return c2 ? `${c1}+${c2}` : `Team ${winner + 1}`;
  }
  const alias = aliases?.[winner]?.trim();
  if (alias) return alias;
  return colors[winner] ?? `Player ${winner + 1}`;
}

export interface SimulationResultsStatsProps {
  result: SimulationResult;
  playerCount: number;
  playerAliases: string[];
  /** Games currently selected in the games list (for Selection tab). */
  selectedGames?: GameResultWithHistory[];
  /** All games (for Heatmap tab). */
  games?: GameResultWithHistory[];
  layoutConfig?: BoardLayoutConfig;
  gameSettings?: GameSettings;
}

const MAX_TURNS_AXIS = 400;

export default function SimulationResultsStats({
  result,
  playerCount: players,
  playerAliases,
  selectedGames = [],
  games = [],
  layoutConfig,
  gameSettings,
}: SimulationResultsStatsProps) {
  const [activeTab, setActiveTab] = useState<'simulation' | 'selection' | 'heatmap'>('simulation');
  const [heatmapExcludeStartTiles, setHeatmapExcludeStartTiles] = useState(false);
  const selectionStats = selectedGames.length > 0 ? computeHistoryStats(selectedGames, players) : undefined;
  const heatmapState = useMemo(
    () => (gameSettings ? createGameStateFromSettings(gameSettings) : null),
    [gameSettings]
  );
  const heatmapSegmentCountsRaw = useMemo(() => {
    if (games.length === 0 || !heatmapState?.board || !layoutConfig) return undefined;
    return computeSegmentVisitCounts(games, heatmapState.board, layoutConfig);
  }, [games, heatmapState?.board, layoutConfig]);
  const heatmapSegmentCounts = useMemo(() => {
    if (!heatmapSegmentCountsRaw || !layoutConfig) return heatmapSegmentCountsRaw;
    if (!heatmapExcludeStartTiles) return heatmapSegmentCountsRaw;
    const startIndices = getStartCircleIndices(layoutConfig);
    return heatmapSegmentCountsRaw.map((c, i) =>
      startIndices.includes(i) ? 0 : c
    );
  }, [heatmapSegmentCountsRaw, layoutConfig, heatmapExcludeStartTiles]);
  const turnsData = result.turns && result.turns.length > 0
    ? result.turns
    : [result.minTurns, result.p25Turns, result.medianTurns, result.p75Turns, result.maxTurns];

  const boxData = {
    labels: ['Game length'],
    datasets: [{
      label: 'Turns',
      data: [turnsData],
      backgroundColor: 'rgba(168, 85, 247, 0.25)', // purple-500
      borderColor: '#c4b5fd', // violet-300 for box & whiskers (min/max/median)
      borderWidth: 1.5,
      outlierBackgroundColor: 'rgba(192, 132, 252, 0.5)', // violet-400
      outlierBorderColor: '#a855f7', // purple-500
      meanBackgroundColor: '#f97316', // orange-500 for avg marker
      meanBorderColor: '#fdba74', // orange-300
    }],
  };

  const boxOptions = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y' as const,
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false },
    },
    scales: {
      x: {
        title: { display: true, text: 'Turns per game', color: '#a1a1aa', font: { size: 11 } },
        grid: { color: 'rgba(168, 85, 247, 0.14)' },
        ticks: { color: '#a1a1aa', font: { size: 10 } },
        min: 0,
        max: MAX_TURNS_AXIS,
      },
      y: {
        grid: { display: false },
        ticks: { display: false },
      },
    },
  };

  return (
    <div className="sim-results-stats">
      <div className="sim-results-tabs">
        <button
          type="button"
          className={`sim-results-tab${activeTab === 'simulation' ? ' sim-results-tab--active' : ''}`}
          onClick={() => setActiveTab('simulation')}
        >
          Simulation
        </button>
        <button
          type="button"
          className={`sim-results-tab${activeTab === 'selection' ? ' sim-results-tab--active' : ''}`}
          onClick={() => setActiveTab('selection')}
        >
          Selection {selectedGames.length > 0 && `(${selectedGames.length})`}
        </button>
        <button
          type="button"
          className={`sim-results-tab${activeTab === 'heatmap' ? ' sim-results-tab--active' : ''}`}
          onClick={() => setActiveTab('heatmap')}
        >
          Heatmap
        </button>
      </div>
      {activeTab === 'simulation' && (
        <>
      <div className="sim-results-hero">
        <span className="sim-results-hero-num">{result.totalGames}</span>
        <span className="sim-results-hero-unit">games</span>
        {result.draws > 0 && (
          <span className="sim-results-hero-draws">
            {result.draws} draws{result.maxTurnsReached > 0 ? ' (max turns reached)' : ''}
          </span>
        )}
      </div>
      <div className="sim-results-wins">
        <h4 className="sim-results-section-title">Wins</h4>
        <div className="sim-wins-bars">
          {result.teamWins.map((w, i) => {
            const pct = result.totalGames > 0 ? (w / result.totalGames) * 100 : 0;
            const colors = getColorsForPlayerCount(players);
            const partnerIdx = partnersExist(players) ? getPartnerIndex(i, players) : -1;
            const teamColors = partnerIdx >= 0 ? [colors[i], colors[partnerIdx]] : [colors[i]];
            return (
              <div key={i} className="sim-win-row">
                <div className="sim-win-row-label">
                  <span className="sim-wins-legend-swatches">
                    {teamColors.map((c, j) => (
                      <span key={j} className="sim-win-swatch" style={{ backgroundColor: getColorHex(c ?? 'GRAY') }} />
                    ))}
                  </span>
                  <span className="sim-win-row-name">{getWinnerLabel(i, players, playerAliases)}</span>
                  <span className="sim-win-row-val">{w}</span>
                  <span className="sim-win-row-pct">({pct.toFixed(0)}%)</span>
                </div>
                <div className="sim-win-row-bar-wrap">
                  <div
                    className="sim-win-row-bar-fill"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
          {result.draws > 0 && (
            <div className="sim-win-row sim-win-row--draws">
              <div className="sim-win-row-label">
                <span className="sim-win-row-name">Draws</span>
                <span className="sim-win-row-val">{result.draws}</span>
                <span className="sim-win-row-pct">({((result.draws / result.totalGames) * 100).toFixed(0)}%)</span>
              </div>
              <div className="sim-win-row-bar-wrap">
                <div
                  className="sim-win-row-bar-fill sim-win-row-bar-fill--draws"
                  style={{ width: `${(result.draws / result.totalGames) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="sim-results-turns">
        <h4 className="sim-results-section-title">Game length (turns)</h4>
        <div className="sim-chartjs-boxplot">
          <Chart type="boxplot" data={boxData} options={boxOptions} height={140} />
        </div>
        <div className="sim-turns-grid">
          <div className="sim-turns-group">
            <div className="sim-turns-item" title="Shortest game length (turns)">
              <span className="sim-turns-item-label">Min</span>
              <span className="sim-turns-item-val">{result.minTurns}</span>
            </div>
            <div className="sim-turns-item" title="Longest game length (turns)">
              <span className="sim-turns-item-label">Max</span>
              <span className="sim-turns-item-val">{result.maxTurns}</span>
            </div>
          </div>
          <div className="sim-turns-group">
            <div className="sim-turns-item" title="25th percentile – 25% of games finished in this many turns or fewer">
              <span className="sim-turns-item-label">P25</span>
              <span className="sim-turns-item-val">{result.p25Turns}</span>
            </div>
            <div className="sim-turns-item" title="Median – half of games finished in fewer turns, half in more">
              <span className="sim-turns-item-label">Median</span>
              <span className="sim-turns-item-val">{result.medianTurns}</span>
            </div>
            <div className="sim-turns-item" title="75th percentile – 75% of games finished in this many turns or fewer">
              <span className="sim-turns-item-label">P75</span>
              <span className="sim-turns-item-val">{result.p75Turns}</span>
            </div>
          </div>
          <div className="sim-turns-group">
            <div className="sim-turns-item" title="Average (mean) turns per game">
              <span className="sim-turns-item-label">Avg</span>
              <span className="sim-turns-item-val">{result.avgTurns.toFixed(1)}</span>
            </div>
            <div className="sim-turns-item" title="Standard deviation – how spread out the game lengths are">
              <span className="sim-turns-item-label">Std dev</span>
              <span className="sim-turns-item-val">{result.stdDevTurns.toFixed(1)}</span>
            </div>
            <div className="sim-turns-item" title="Interquartile range (P75 − P25) – spread of the middle 50% of games">
              <span className="sim-turns-item-label">IQR</span>
              <span className="sim-turns-item-val">{result.iqrTurns.toFixed(0)}</span>
            </div>
          </div>
        </div>
      </div>
      {result.winnerTurns && result.winnerTurns.length > 0 && (() => {
        const median = result.medianTurns;
        const short = result.winnerTurns!.filter((w) => w.turns < median);
        const long = result.winnerTurns!.filter((w) => w.turns >= median);
        const shortWins = new Array(result.teamWins.length).fill(0);
        const longWins = new Array(result.teamWins.length).fill(0);
        for (const { winner } of short) shortWins[winner]++;
        for (const { winner } of long) longWins[winner]++;
        const shortTotal = short.length;
        const longTotal = long.length;
        return (
          <div className="sim-results-win-by-length">
            <h4 className="sim-results-section-title">Win rate by game length</h4>
            <table className="sim-win-by-length-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Short (&lt;{median} turns)</th>
                  <th>Long (≥{median} turns)</th>
                </tr>
              </thead>
              <tbody>
                {result.teamWins.map((_, i) => {
                  const colors = getColorsForPlayerCount(players);
                  const partnerIdx = partnersExist(players) ? getPartnerIndex(i, players) : -1;
                  const teamColors = partnerIdx >= 0 ? [colors[i], colors[partnerIdx]] : [colors[i]];
                  return (
                  <tr key={i}>
                    <td className="sim-win-by-length-team">
                      <span className="sim-wins-legend-swatches">
                        {teamColors.map((c, j) => (
                          <span key={j} className="sim-win-swatch" style={{ backgroundColor: getColorHex(c ?? 'GRAY') }} />
                        ))}
                      </span>
                      {getWinnerLabel(i, players, playerAliases)}
                    </td>
                    <td className="sim-win-by-length-cell">
                      {shortWins[i]} ({shortTotal > 0 ? ((shortWins[i] / shortTotal) * 100).toFixed(0) : 0}%)
                    </td>
                    <td className="sim-win-by-length-cell">
                      {longWins[i]} ({longTotal > 0 ? ((longWins[i] / longTotal) * 100).toFixed(0) : 0}%)
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })()}
      {result.historyStats?.perPlayer && (() => {
        const pp = result.historyStats.perPlayer;
        const colors = getColorsForPlayerCount(players);
        const teamCount = partnersExist(players) ? Math.floor(players / 2) : players;
        const getTeamPlayers = (teamIdx: number) =>
          partnersExist(players)
            ? [teamIdx, getPartnerIndex(teamIdx, players)].filter((i) => i >= 0)
            : [teamIdx];
        const statRows: { key: string; label: string; title: string; getVal: (i: number) => number }[] = [
          { key: 'kosDealt', label: 'KOs dealt', title: 'Knockouts dealt – sent opponents home', getVal: (i) => pp.knockoutsDealt[i] ?? 0 },
          { key: 'kosReceived', label: 'KOs received', title: 'Knockouts received – got sent home', getVal: (i) => pp.knockoutsReceived[i] ?? 0 },
          { key: 'folds', label: 'Folds', title: 'Times folded (no playable card)', getVal: (i) => pp.folds[i] ?? 0 },
          { key: 'locks', label: 'Locks', title: 'Pawns locked in end zone', getVal: (i) => pp.locks[i] ?? 0 },
          { key: 'swaps', label: 'Swaps', title: 'Swap card plays', getVal: (i) => pp.swaps[i] ?? 0 },
        ];
        return (
          <div className="sim-results-history-stats">
            <h4 className="sim-results-section-title">Per player (from {result.historyStats.sampleSize} games)</h4>
            <div className="sim-per-player-columns" style={{ gridTemplateColumns: `repeat(${teamCount}, 1fr)` }}>
              {Array.from({ length: teamCount }, (_, teamIdx) => {
                const teamPlayers = getTeamPlayers(teamIdx);
                return (
                  <div key={teamIdx} className="sim-per-player-col">
                    <table className="sim-per-player-table">
                      <thead>
                        <tr>
                          <th className="sim-per-player-th-label"></th>
                          {teamPlayers.map((i) => {
                            const alias = playerAliases?.[i]?.trim();
                            const colorName = colors[i] ?? `P${i + 1}`;
                            const label = alias ? `${alias} (${colorName})` : colorName;
                            return (
                              <th key={i} className="sim-per-player-th">
                                <span className="sim-per-player-th-inner">
                                  <span className="sim-wins-legend-swatches">
                                    <span className="sim-win-swatch" style={{ backgroundColor: getColorHex(colors[i] ?? 'GRAY') }} />
                                  </span>
                                  {label}
                                </span>
                              </th>
                            );
                          })}
                          <th className="sim-per-player-th sim-per-player-th-sum">Sum</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statRows.map((row) => {
                          const maxVal = players > 0 ? Math.max(...Array.from({ length: players }, (_, i) => row.getVal(i))) : 0;
                          const sum = teamPlayers.reduce((a, i) => a + row.getVal(i), 0);
                          return (
                            <tr key={row.key}>
                              <td className="sim-per-player-label" title={row.title}>{row.label}</td>
                              {teamPlayers.map((i) => {
                                const v = row.getVal(i);
                                const isMax = maxVal > 0 && v === maxVal;
                                return (
                                  <td key={i} className={`sim-per-player-val${isMax ? ' sim-per-player-val-high' : ''}`}>{v}</td>
                                );
                              })}
                              <td className="sim-per-player-val sim-per-player-sum-cell">{sum}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
        </>
      )}
      {activeTab === 'selection' && (
        <div className="sim-results-selection">
          {selectedGames.length === 0 ? (
            <p className="sim-results-selection-empty">
              Select a game from the list to see stats for the selection.
            </p>
          ) : selectionStats?.perPlayer ? (
            (() => {
              const pp = selectionStats.perPlayer;
              const colors = getColorsForPlayerCount(players);
              const teamCount = partnersExist(players) ? Math.floor(players / 2) : players;
              const getTeamPlayers = (teamIdx: number) =>
                partnersExist(players)
                  ? [teamIdx, getPartnerIndex(teamIdx, players)].filter((i) => i >= 0)
                  : [teamIdx];
              const statRows: { key: string; label: string; title: string; getVal: (i: number) => number }[] = [
                { key: 'kosDealt', label: 'KOs dealt', title: 'Knockouts dealt', getVal: (i) => pp.knockoutsDealt[i] ?? 0 },
                { key: 'kosReceived', label: 'KOs received', title: 'Knockouts received', getVal: (i) => pp.knockoutsReceived[i] ?? 0 },
                { key: 'folds', label: 'Folds', title: 'Folds', getVal: (i) => pp.folds[i] ?? 0 },
                { key: 'locks', label: 'Locks', title: 'Locks', getVal: (i) => pp.locks[i] ?? 0 },
                { key: 'swaps', label: 'Swaps', title: 'Swaps', getVal: (i) => pp.swaps[i] ?? 0 },
              ];
              const turns = selectedGames.map((g) => g.turns);
              const wins = new Array(teamCount).fill(0);
              for (const g of selectedGames) {
                if (g.winner !== null) wins[g.winner]++;
              }
              return (
                <>
                  <div className="sim-results-hero sim-results-hero--small">
                    <span className="sim-results-hero-num">{selectedGames.length}</span>
                    <span className="sim-results-hero-unit">game{selectedGames.length !== 1 ? 's' : ''} selected</span>
                  </div>
                  {selectedGames.length > 1 && (
                    <div className="sim-results-wins">
                      <h4 className="sim-results-section-title">Wins</h4>
                      <div className="sim-wins-bars">
                        {wins.map((w, i) => {
                          const pct = selectedGames.length > 0 ? (w / selectedGames.length) * 100 : 0;
                          const partnerIdx = partnersExist(players) ? getPartnerIndex(i, players) : -1;
                          const teamColors = partnerIdx >= 0 ? [colors[i], colors[partnerIdx]] : [colors[i]];
                          return (
                            <div key={i} className="sim-win-row">
                              <div className="sim-win-row-label">
                                <span className="sim-wins-legend-swatches">
                                  {teamColors.map((c, j) => (
                                    <span key={j} className="sim-win-swatch" style={{ backgroundColor: getColorHex(c ?? 'GRAY') }} />
                                  ))}
                                </span>
                                <span className="sim-win-row-name">{getWinnerLabel(i, players, playerAliases)}</span>
                                <span className="sim-win-row-val">{w}</span>
                                <span className="sim-win-row-pct">({pct.toFixed(0)}%)</span>
                              </div>
                              <div className="sim-win-row-bar-wrap">
                                <div className="sim-win-row-bar-fill" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {turns.length > 0 && (
                    <div className="sim-results-turns">
                      <h4 className="sim-results-section-title">Game length (turns)</h4>
                      <div className="sim-turns-grid">
                        <div className="sim-turns-group">
                          <div className="sim-turns-item">
                            <span className="sim-turns-item-label">Min</span>
                            <span className="sim-turns-item-val">{Math.min(...turns)}</span>
                          </div>
                          <div className="sim-turns-item">
                            <span className="sim-turns-item-label">Max</span>
                            <span className="sim-turns-item-val">{Math.max(...turns)}</span>
                          </div>
                          <div className="sim-turns-item">
                            <span className="sim-turns-item-label">Avg</span>
                            <span className="sim-turns-item-val">{(turns.reduce((a, b) => a + b, 0) / turns.length).toFixed(1)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="sim-results-history-stats">
                    <h4 className="sim-results-section-title">Per player (from {selectionStats.sampleSize} selected)</h4>
                    <div className="sim-per-player-columns" style={{ gridTemplateColumns: `repeat(${teamCount}, 1fr)` }}>
                      {Array.from({ length: teamCount }, (_, teamIdx) => {
                        const teamPlayers = getTeamPlayers(teamIdx);
                        return (
                          <div key={teamIdx} className="sim-per-player-col">
                            <table className="sim-per-player-table">
                              <thead>
                                <tr>
                                  <th className="sim-per-player-th-label"></th>
                                  {teamPlayers.map((i) => {
                                    const alias = playerAliases?.[i]?.trim();
                                    const colorName = colors[i] ?? `P${i + 1}`;
                                    const label = alias ? `${alias} (${colorName})` : colorName;
                                    return (
                                      <th key={i} className="sim-per-player-th">
                                        <span className="sim-per-player-th-inner">
                                          <span className="sim-wins-legend-swatches">
                                            <span className="sim-win-swatch" style={{ backgroundColor: getColorHex(colors[i] ?? 'GRAY') }} />
                                          </span>
                                          {label}
                                        </span>
                                      </th>
                                    );
                                  })}
                                  <th className="sim-per-player-th sim-per-player-th-sum">Sum</th>
                                </tr>
                              </thead>
                              <tbody>
                                {statRows.map((row) => {
                                  const maxVal = players > 0 ? Math.max(...Array.from({ length: players }, (_, i) => row.getVal(i))) : 0;
                                  const sum = teamPlayers.reduce((a, i) => a + row.getVal(i), 0);
                                  return (
                                    <tr key={row.key}>
                                      <td className="sim-per-player-label" title={row.title}>{row.label}</td>
                                      {teamPlayers.map((i) => {
                                        const v = row.getVal(i);
                                        const isMax = maxVal > 0 && v === maxVal;
                                        return (
                                          <td key={i} className={`sim-per-player-val${isMax ? ' sim-per-player-val-high' : ''}`}>{v}</td>
                                        );
                                      })}
                                      <td className="sim-per-player-val sim-per-player-sum-cell">{sum}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              );
            })()
          ) : null}
        </div>
      )}
      {activeTab === 'heatmap' && (
        <div className="sim-results-heatmap">
          {games.length === 0 ? (
            <p className="sim-results-selection-empty">No games to show heatmap.</p>
          ) : heatmapState && layoutConfig ? (
            <div className="sim-heatmap-board-wrap">
              <Board
                state={heatmapState}
                layoutConfig={layoutConfig}
                heatmapSegmentCounts={heatmapSegmentCounts}
                showDeck={false}
              />
              <div className="sim-heatmap-legend">
                <p className="sim-heatmap-legend-text">
                  Pawn visits per tile across {games.length} games
                </p>
                <label className="sim-heatmap-toggle">
                  <input
                    type="checkbox"
                    checked={heatmapExcludeStartTiles}
                    onChange={(e) => setHeatmapExcludeStartTiles(e.target.checked)}
                  />
                  <span>Exclude start tiles (better distribution for track)</span>
                </label>
                <div className="sim-heatmap-scale">
                  <span className="sim-heatmap-scale-label">Fewer visits</span>
                  <div className="sim-heatmap-scale-bar" />
                  <span className="sim-heatmap-scale-label">More visits</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="sim-results-selection-empty">Board layout not available.</p>
          )}
        </div>
      )}
    </div>
  );
}

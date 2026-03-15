import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  runGameWithHistory,
  createRandomStrategy,
  createSmartStrategy,
  createRandomExchangeStrategy,
  createSmartExchangeStrategy,
} from '@game/index';
import { createSmartPlusStrategy, summarizeTurns, extractPerPlayerStatsFromGame, mergePerPlayerStats } from '@game/simulation';
import { useStrategy } from '@/contexts/StrategyContext';
import { getColorsForPlayerCount, partnersExist, getPartnerIndex } from '@game/index';
import type { GameSettings } from '@game/types';
import type { GameResultWithHistory, SimulationResult, PerPlayerHistoryStats } from '@game/simulation';
import type { SimulationData } from '@/contexts/SimulationContext';
import SimulationResultsStats from '@/components/SimulationResultsStats';
import SimulationResultsGames from '@/components/SimulationResultsGames';
import { createDefaultBoardLayoutConfig, type BoardLayoutConfig } from '@/lib/board-layout-config';
import { getColorHex } from '@/lib/color-utils';
import { useSimulation } from '@/contexts/SimulationContext';

const EXPORT_VERSION = 1;

type StrategyName = 'random' | 'smart' | 'smartplus' | 'custom';

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

function makeStrategies(
  name: StrategyName,
  customWeights?: { weights: import('@game/simulation').SmartWeights; base: 'smart' | 'smartplus' }
): { play: any; exchange: any } {
  const rng = Math.random;
  if (name === 'custom' && customWeights) {
    const { weights, base } = customWeights;
    if (base === 'smartplus') {
      return { play: createSmartPlusStrategy(rng, weights), exchange: createSmartExchangeStrategy(rng) };
    }
    return { play: createSmartStrategy(rng, weights), exchange: createSmartExchangeStrategy(rng) };
  }
  if (name === 'smart') return { play: createSmartStrategy(rng), exchange: createSmartExchangeStrategy(rng) };
  if (name === 'smartplus') return { play: createSmartPlusStrategy(rng), exchange: createSmartExchangeStrategy(rng) };
  return { play: createRandomStrategy(rng), exchange: createRandomExchangeStrategy(rng) };
}

export default function SimulationPage() {
  const navigate = useNavigate();
  const simContext = useSimulation();
  const strategyCtx = useStrategy();
  const activePreset = strategyCtx?.getActivePreset() ?? null;
  const [players, setPlayers] = useState(4);
  const [pawns, setPawns] = useState(4);
  const [tiles, setTiles] = useState(14);
  const [shuffleMode, setShuffleMode] = useState<'always' | 'when_needed'>('always');
  const [strategies, setStrategies] = useState<StrategyName[]>(['smart', 'smart', 'smart', 'smart']);
  const [playerAliases, setPlayerAliases] = useState<string[]>(['', '', '', '']);
  const [numGames, setNumGames] = useState(10);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<{ completed: number; total: number; phase?: string } | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [games, setGames] = useState<GameResultWithHistory[]>([]);
  const [selectedGameIndex, setSelectedGameIndex] = useState<number | null>(null);
  const [selectedGameIndices, setSelectedGameIndices] = useState<number[]>([]);
  const [layoutConfig, setLayoutConfig] = useState<BoardLayoutConfig>(() => createDefaultBoardLayoutConfig());
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLayoutConfig(createDefaultBoardLayoutConfig({ playerCount: players, pawnsPerPlayer: pawns, trackTilesPerPlayer: tiles }));
  }, [players, pawns, tiles]);

  useEffect(() => {
    setPlayerAliases((prev) => {
      const next = prev.slice(0, players);
      while (next.length < players) next.push('');
      return next;
    });
  }, [players]);

  useEffect(() => {
    const d = simContext?.simulationData;
    if (d && d.games.length > 0) {
      setResult(d.result);
      setGames(d.games);
      setSelectedGameIndex(0);
      setSelectedGameIndices([0]);
      setLayoutConfig(d.layoutConfig);
    }
  }, [simContext?.simulationData]);

  const settings: GameSettings = {
    playerCount: players,
    pawnsPerPlayer: pawns,
    trackTilesPerPlayer: tiles,
    shuffleMode,
  };

  const handleRun = useCallback(async () => {
    setIsRunning(true);
    setResult(null);
    setGames([]);
    setSelectedGameIndex(null);
    setSelectedGameIndices([]);
    setProgress({ completed: 0, total: numGames });
    try {
      const stratList = strategies.slice(0, players);
      while (stratList.length < players) stratList.push('smart');
      const customWeights = activePreset ? { weights: activePreset.weights, base: activePreset.base } : undefined;
      const playStrategies = stratList.map((s) => makeStrategies(s, s === 'custom' ? customWeights : undefined).play);
      const exchangeStrategies = stratList.map((s) => makeStrategies(s, s === 'custom' ? customWeights : undefined).exchange);
      const winCountLength = partnersExist(players) ? Math.floor(players / 2) : players;
      const teamWins = new Array(winCountLength).fill(0);
      let draws = 0;
      const turns: number[] = [];
      const gamesWithHistory: GameResultWithHistory[] = [];
      const BATCH_SIZE = 25;
      let shortGamesCount = 0;
      let longGamesCount = 0;
      const winnerTurns: { winner: number; turns: number }[] = numGames <= 10000 ? [] : [];
      const perPlayerAcc: PerPlayerHistoryStats = {
        knockoutsDealt: new Array(players).fill(0),
        knockoutsReceived: new Array(players).fill(0),
        folds: new Array(players).fill(0),
        locks: new Array(players).fill(0),
        swaps: new Array(players).fill(0),
      };
      for (let i = 0; i < numGames; ) {
        const batchEnd = Math.min(i + BATCH_SIZE, numGames);
        for (let j = i; j < batchEnd; j++) {
          const rng = () => Math.random();
          const g = runGameWithHistory(settings, playStrategies, rng, 10000, exchangeStrategies);
          gamesWithHistory.push(g);
          mergePerPlayerStats(perPlayerAcc, extractPerPlayerStatsFromGame(g, players), players);
          if (g.winner !== null) {
            teamWins[g.winner]++;
            if (numGames <= 10000) winnerTurns.push({ winner: g.winner, turns: g.turns });
          } else draws++;
          turns.push(g.turns);
          const t = turns[turns.length - 1];
          if (t < 100) shortGamesCount++;
          if (t > 250) longGamesCount++;
        }
        i = batchEnd;
        setProgress({ completed: i, total: numGames });
        await new Promise((r) => setTimeout(r, 0));
      }
      setProgress({ completed: numGames, total: numGames, phase: 'summarizing' });
      await new Promise((r) => setTimeout(r, 50));
      const stats = summarizeTurns(turns);
      const historyStats = { sampleSize: numGames, perPlayer: perPlayerAcc };
      setResult({
        totalGames: numGames,
        teamWins,
        draws,
        maxTurnsReached: draws,
        shortGamesCount,
        longGamesCount,
        winnerTurns: numGames <= 10000 && winnerTurns.length > 0 ? winnerTurns : undefined,
        historyStats,
        ...stats,
        turns: numGames <= 10000 ? turns : undefined,
      });
      setGames(gamesWithHistory);
      const hasGames = gamesWithHistory.length > 0;
      setSelectedGameIndex(hasGames ? 0 : null);
      setSelectedGameIndices(hasGames ? [0] : []);
      simContext?.setSimulationData({
        result: {
          totalGames: numGames,
          teamWins,
          draws,
          maxTurnsReached: draws,
          shortGamesCount,
          longGamesCount,
          winnerTurns: numGames <= 10000 && winnerTurns.length > 0 ? winnerTurns : undefined,
          historyStats: { sampleSize: numGames, perPlayer: perPlayerAcc },
          ...stats,
          turns: numGames <= 10000 ? turns : undefined,
        },
        games: gamesWithHistory,
        playerCount: players,
        playerAliases: playerAliases.slice(0, players),
        gameSettings: settings,
        layoutConfig: createDefaultBoardLayoutConfig({ playerCount: players, pawnsPerPlayer: pawns, trackTilesPerPlayer: tiles }),
      });
    } finally {
      setIsRunning(false);
      setProgress(null);
    }
  }, [players, pawns, tiles, shuffleMode, strategies, numGames, playerAliases, simContext, activePreset]);

  const handleGameClick = (idx: number, metaKey?: boolean) => {
    setSelectedGameIndex(idx);
    if (metaKey) {
      setSelectedGameIndices((prev) =>
        prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx].sort((a, b) => a - b)
      );
    } else {
      setSelectedGameIndices([idx]);
    }
  };

  const selectedGamesForStats =
    selectedGameIndices.length > 0
      ? selectedGameIndices.map((i) => games[i]).filter(Boolean)
      : selectedGameIndex !== null && games[selectedGameIndex]
        ? [games[selectedGameIndex!]]
        : [];

  const handleReplayClick = () => {
    if (selectedGameIndex !== null && games.length > 0) {
      // Pass only gameIndex to avoid history state size limit (browsers ~640KB–2MB).
      // Replay page reads games/layoutConfig from SimulationContext.
      navigate('/replay', {
        state: { gameIndex: selectedGameIndex },
      });
    }
  };

  const handleExport = () => {
    if (!result || games.length === 0) return;
    const data: SimulationData & { version: number } = {
      version: EXPORT_VERSION,
      result,
      games,
      playerCount: players,
      playerAliases: playerAliases.slice(0, players),
      gameSettings: settings,
      layoutConfig,
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `partners-simulation-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const validateImportData = (data: unknown): data is SimulationData => {
    if (!data || typeof data !== 'object') return false;
    const d = data as Record<string, unknown>;
    if (d.version !== 1 && d.version !== undefined) return false;
    if (!Array.isArray(d.games) || d.games.length === 0) return false;
    for (const g of d.games) {
      if (!g || typeof g !== 'object') return false;
      const game = g as Record<string, unknown>;
      if (!Array.isArray(game.history)) return false;
      if (typeof (game.winner ?? 0) !== 'number' && game.winner !== null) return false;
      if (typeof (game.turns ?? 0) !== 'number') return false;
    }
    const pc = d.playerCount as number;
    if (typeof pc !== 'number' || pc < 2 || pc > 12) return false;
    const cfg = d.layoutConfig as Record<string, unknown>;
    if (!cfg || typeof cfg !== 'object') return false;
    if (!Array.isArray(cfg.playerColors) || cfg.playerColors.length < pc) return false;
    if (!Array.isArray(cfg.playerAngles) || cfg.playerAngles.length < pc) return false;
    if (!Array.isArray(cfg.endRadii) || !Array.isArray(cfg.endSpotRadii)) return false;
    if (cfg.playerCount !== pc) return false;
    return true;
  };

  const handleImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      setImportError(null);
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as unknown;
        if (!validateImportData(parsed)) {
          setImportError('Invalid simulation file. Check format and version.');
          return;
        }
        const { version: _v, ...simData } = parsed as SimulationData & { version?: number };
        simContext?.setSimulationData(simData as SimulationData);
        e.target.value = '';
      } catch (err) {
        setImportError(err instanceof Error ? err.message : 'Failed to parse file.');
      }
    },
    [simContext]
  );

  return (
      <div className="sim-setup-view custom-scrollbar">
        <h1 className="sim-page-title">Simulation</h1>
        <div className="sim-setup-content">
        <div className="sim-setup-form">
          <div className="layout-section sim-section">
            <h3>Game settings</h3>
            <div className="control control-inline">
              <label>Players</label>
              <input type="number" min={2} max={12} value={players} onChange={(e) => setPlayers(Math.max(2, Math.min(12, Number(e.target.value) || 4)))} />
            </div>
            <div className="control control-inline">
              <label>Pawns</label>
              <input type="number" min={1} max={8} value={pawns} onChange={(e) => setPawns(Math.max(1, Math.min(8, Number(e.target.value) || 4)))} />
            </div>
            <div className="control control-inline">
              <label>Track tiles</label>
              <input type="number" min={1} max={20} value={tiles} onChange={(e) => setTiles(Math.max(1, Math.min(20, Number(e.target.value) || 14)))} />
            </div>
            <div className="control control-inline">
              <label>Rules</label>
              <div className="sim-rules-radios">
                <label>
                  <input
                    type="radio"
                    name="shuffleMode"
                    value="always"
                    checked={shuffleMode === 'always'}
                    onChange={() => setShuffleMode('always')}
                  />
                  {' '}Always shuffle (standard)
                </label>
                <label>
                  <input
                    type="radio"
                    name="shuffleMode"
                    value="when_needed"
                    checked={shuffleMode === 'when_needed'}
                    onChange={() => setShuffleMode('when_needed')}
                  />
                  {' '}Shuffle when needed (Torsnes)
                </label>
              </div>
            </div>
          </div>
          <div className="layout-section sim-section">
            <h3>Strategies</h3>
            <div className="sim-strategy-header">
              <span className="sim-strategy-header-swatch" />
              <span className="sim-strategy-header-alias">Alias</span>
              <span className="sim-strategy-header-strategy">Strategy</span>
            </div>
            <div className="sim-strategy-list custom-scrollbar">
              {Array.from({ length: players }).map((_, p) => (
                <div key={p} className="sim-strategy-item">
                  <span
                    className="sim-strategy-swatch"
                    style={{ backgroundColor: getColorHex(getColorsForPlayerCount(players)[p] ?? 'RED') }}
                    title={getColorsForPlayerCount(players)[p] ?? 'Player color'}
                  />
                  <input
                    type="text"
                    className="sim-strategy-alias"
                    placeholder={`Player ${p + 1}`}
                    value={playerAliases[p] ?? ''}
                    onChange={(e) => {
                      const next = [...playerAliases];
                      next[p] = e.target.value;
                      setPlayerAliases(next);
                    }}
                    title="Optional alias for this player/team"
                  />
                  <select
                    value={strategies[p] ?? 'smart'}
                    onChange={(e) => {
                      const next = [...strategies];
                      next[p] = e.target.value as StrategyName;
                      setStrategies(next);
                    }}
                    className="sim-strategy-select"
                  >
                    <option value="smart">Smart</option>
                    <option value="smartplus">Smart+</option>
                    <option value="random">Random</option>
                    <option value="custom" disabled={!activePreset}>
                      Custom {activePreset ? `(${activePreset.name})` : '(no preset)'}
                    </option>
                  </select>
                </div>
              ))}
            </div>
          </div>
          <div className="layout-section sim-section">
            <h3>Simulation settings</h3>
            <div className="control control-inline">
              <label>Number of games</label>
              <input type="number" min={1} max={100000} value={numGames} onChange={(e) => setNumGames(Math.max(1, Math.min(100000, Number(e.target.value) || 10)))} />
            </div>
            <div className="sim-actions-col">
              <div className="sim-actions-row">
                <button type="button" className="sim-btn-run" onClick={handleRun} disabled={isRunning}>
                  {isRunning ? 'Running…' : 'Run simulation'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="sim-import-input"
                  aria-hidden
                  onChange={handleImport}
                />
                <button
                  type="button"
                  className="sim-btn-import"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isRunning}
                >
                  Import simulation
                </button>
              </div>
              {result && games.length > 0 && (
                <button type="button" className="sim-btn-export sim-btn-export-below" onClick={handleExport}>
                  Export simulation
                </button>
              )}
            </div>
            {importError && (
              <p className="sim-import-error" role="alert">
                {importError}
              </p>
            )}
          </div>
        </div>
        <aside className="sim-results-container">
          {progress && (
            <div className="sim-progress-wrapper">
              <div className="sim-progress-label">
                {progress.phase === 'summarizing' ? 'Summarizing results…' : `Running ${progress.total.toLocaleString()} game(s)…`}
              </div>
              <div className="sim-progress-bar">
                <div
                  className="sim-progress-fill"
                  style={{ width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%` }}
                />
              </div>
              <div className="sim-progress-count">
                {progress.completed.toLocaleString()} / {progress.total.toLocaleString()}
              </div>
            </div>
          )}
          {result && !progress && (
            <div className="sim-results-main">
              <SimulationResultsStats
                result={result}
                playerCount={players}
                playerAliases={playerAliases}
                selectedGames={selectedGamesForStats}
                games={games}
                layoutConfig={layoutConfig}
                gameSettings={settings}
              />
            </div>
          )}
          {games.length > 0 && !progress && (
            <div className="sim-results-sidebar">
              <SimulationResultsGames
                games={games}
                playerCount={players}
                playerAliases={playerAliases}
                selectedGameIndex={selectedGameIndex}
                selectedGameIndices={selectedGameIndices}
                onGameClick={handleGameClick}
                onReplayClick={handleReplayClick}
              />
            </div>
          )}
        </aside>
        </div>
      </div>
    );
}

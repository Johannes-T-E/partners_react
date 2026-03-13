import { useState, useCallback, useRef, useEffect } from 'react';
import {
  startGame,
  playFromHand,
  foldHand,
  applyExchange,
  getLegalActionsForCard,
  getColorsForPlayerCount,
  getWinningTeam,
  checkWin,
  partnersExist,
  getPartnerIndex,
  placeMover,
  type GameState,
  type GameSettings,
  type Action,
} from '@game/index';
import type { Card } from '@game/types';
import type { HistoryEntry } from '@game/simulation';
import type { MoveType } from '@game/history-format';
import {
  formatActionDescForHistory,
  formatShuffleDesc,
  formatDealDesc,
  getStateForShuffleEntry,
  getStateForGameStarted,
  computeMoveTypes,
  getBumpedPawn,
  getMoverIdsFromEntry,
} from '@game/history-format';
import { Board } from '@/components/Board';
import CardComponent from '@/components/Card';
import HistoryEntryComponent from '@/components/HistoryEntry';
import ResizablePanel from '@/components/ResizablePanel';
import { createDefaultBoardLayoutConfig, type BoardLayoutConfig } from '@/lib/board-layout-config';
import { getColorHex } from '@/lib/color-utils';
import { buildCenterCardsFromHistory } from '@/lib/buildCenterCards';
import type { CenterCard } from '@web-ui/board-renderer';

const META_TURN = -1;
const HISTORY_FILTERS = ['all', 'play', 'split', 'swap', 'fold', 'lock', 'knockout', 'meta'] as const;
const HISTORY_FILTER_LABELS: Record<string, string> = {
  all: 'All',
  play: 'Plays',
  split: '7 Splits',
  swap: 'Swaps',
  fold: 'Folds',
  lock: 'Locks',
  knockout: 'Knockouts',
  meta: 'Setup',
};

function pawnLabel(moverId: string): string {
  const parts = moverId.split('_');
  return `${parts[0][0].toUpperCase()}${Number(parts[1]) + 1}`;
}

function formatAction(a: Action): string {
  if (a.kind === 'start') return `Start ${pawnLabel(a.moverId)}`;
  if (a.kind === 'number') return `${pawnLabel(a.moverId)} → ${a.steps} steps`;
  if (a.kind === 'four_back') return `${pawnLabel(a.moverId)} → 4 back`;
  if (a.kind === 'one_or_14') return `${pawnLabel(a.moverId)} → ${a.steps}`;
  if (a.kind === 'seven_split') return `Split: ${a.parts.map((p) => `${pawnLabel(p.moverId)}+${p.steps}`).join(', ')}`;
  if (a.kind === 'swap') return `Swap ${pawnLabel(a.moverIdA)} \u21C4 ${pawnLabel(a.moverIdB)}`;
  return JSON.stringify(a);
}

function getWinnerLabel(winner: number, playerCount: number): string {
  const colors = getColorsForPlayerCount(playerCount);
  if (partnersExist(playerCount)) {
    const partnerIdx = getPartnerIndex(winner, playerCount);
    const c1 = colors[winner];
    const c2 = partnerIdx >= 0 ? colors[partnerIdx] : null;
    return c2 ? `${c1}+${c2}` : `Team ${winner}`;
  }
  return colors[winner] ?? `Player ${winner}`;
}

function getMoverIdsFromAction(a: Action): string[] {
  if (a.kind === 'start') return [a.moverId];
  if (a.kind === 'number') return [a.moverId];
  if (a.kind === 'four_back') return [a.moverId];
  if (a.kind === 'one_or_14') return [a.moverId];
  if (a.kind === 'seven_split') return a.parts.map((p) => p.moverId);
  if (a.kind === 'swap') return [a.moverIdA, a.moverIdB];
  return [];
}

function getUsedValue(card: Card, action: Action | 'fold'): 'start' | number | undefined {
  if (typeof action === 'string') return undefined;
  if (card.type === 'START_OR_8') return action.kind === 'start' ? 'start' : 8;
  if (card.type === 'START_OR_13') return action.kind === 'start' ? 'start' : 13;
  if (card.type === 'ONE_OR_14' && action.kind === 'one_or_14') return action.steps;
  return undefined;
}

export default function PlayPage() {
  const [state, setState] = useState<GameState | null>(null);
  const [layoutConfig, setLayoutConfig] = useState<BoardLayoutConfig>(() => createDefaultBoardLayoutConfig());
  const [showGame, setShowGame] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyViewIndex, setHistoryViewIndex] = useState<number | null>(null);
  const [liveState, setLiveState] = useState<GameState | null>(null);
  const [historyFilter, setHistoryFilter] = useState<string>('all');
  const [centerCards, setCenterCards] = useState<CenterCard[]>([]);
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null);
  const [animateMovement, setAnimateMovement] = useState(false);
  const [winMessage, setWinMessage] = useState('');

  const [setupPlayers, setSetupPlayers] = useState(4);
  const [setupPawns, setSetupPawns] = useState(4);
  const [setupTiles, setSetupTiles] = useState(14);
  const [setupShuffleMode, setSetupShuffleMode] = useState<'always' | 'when_needed'>('always');

  const displayState = historyViewIndex !== null ? (history[historyViewIndex]?.state ?? state) : state;
  const colors = getColorsForPlayerCount(state?.settings.playerCount ?? 4);

  const pushHistory = useCallback((entry: HistoryEntry) => {
    setHistory((h) => [...h, entry]);
    setHistoryViewIndex(null);
  }, []);

  const handleStartGame = (players: number, pawns: number, tiles: number, shuffleMode: 'always' | 'when_needed') => {
    const settings: GameSettings = { playerCount: players, pawnsPerPlayer: pawns, trackTilesPerPlayer: tiles, shuffleMode };
    const s = startGame(settings);
    const startColors = getColorsForPlayerCount(players);
    setState(s);
    setLayoutConfig(createDefaultBoardLayoutConfig({ playerCount: players, pawnsPerPlayer: pawns, trackTilesPerPlayer: tiles }));
    const entries: HistoryEntry[] = [
      { turn: META_TURN, playerColor: '', card: null, action: 'exchange', description: 'Game started', state: structuredClone(getStateForGameStarted(s)), moveTypes: ['meta'] },
      ...(s.shuffledThisRound
        ? [{ turn: META_TURN, playerColor: startColors[s.dealerIndex ?? 0] ?? '', card: null, action: 'shuffle' as const, description: formatShuffleDesc(s), state: structuredClone(getStateForShuffleEntry(s)), moveTypes: ['meta'] as MoveType[] }]
        : []),
      { turn: META_TURN, playerColor: startColors[s.dealerIndex ?? 0] ?? '', card: null, action: 'deal' as const, description: formatDealDesc(s), state: structuredClone(s), moveTypes: ['meta'] as MoveType[] },
    ];
    setHistory(entries);
    setHistoryViewIndex(null);
    setLiveState(null);
    setCenterCards([]);
    setSelectedCardIndex(null);
    setWinMessage('');
    setShowGame(true);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const players = Math.max(2, Math.min(12, setupPlayers));
    const pawns = Math.max(1, Math.min(8, setupPawns));
    const tiles = Math.max(1, Math.min(20, setupTiles));
    handleStartGame(players, pawns, tiles, setupShuffleMode);
  };

  const handleExchangeSelect = (idx: number) => {
    if (!state) return;
    const sel = [...(state.exchangeSelection ?? [])];
    const firstUnset = sel.findIndex((s) => s == null);
    const selectingPlayer = firstUnset >= 0 ? firstUnset : 0;
    sel[selectingPlayer] = idx;
    let next: GameState = { ...state, exchangeSelection: sel };
    if (sel.every((s) => s != null)) {
      next = applyExchange(next, sel as number[]);
      pushHistory({ turn: META_TURN, playerColor: '', card: null, action: 'exchange', description: 'Cards exchanged', state: structuredClone(next), moveTypes: ['meta'] });
    }
    setState(next);
  };

  const handlePlayAction = (handIndex: number, action: Action) => {
    if (!state || selectedCardIndex === null) return;
    const playerIndex = state.currentPlayerIndex ?? 0;
    const playerColor = colors[playerIndex] ?? `P${playerIndex}`;
    const card = state.hands?.[playerIndex]?.[handIndex];
    if (!card) return;

    setCenterCards((c) => [...c, { card, playerColor: getColorHex(playerColor), usedValue: getUsedValue(card, action) }]);
    const result = playFromHand(state, handIndex, action);
    setState(result.state);
    setSelectedCardIndex(null);

    const stateForPlay = result.stateAfterPlay ?? result.state;
    const bumped = getBumpedPawn(state, stateForPlay, action);
    pushHistory({
      turn: history.length,
      playerColor,
      card,
      action,
      description: formatActionDescForHistory(playerColor, card, action, state, stateForPlay),
      state: structuredClone(stateForPlay),
      moveTypes: computeMoveTypes(action, stateForPlay, state),
      bumpedPawn: bumped ?? undefined,
    });

    if (result.state.roundPhase === 'exchange') {
      const dealerColor = colors[result.state.dealerIndex ?? 0] ?? '';
      if (result.state.shuffledThisRound) {
        pushHistory({ turn: META_TURN, playerColor: dealerColor, card: null, action: 'shuffle', description: formatShuffleDesc(result.state), state: structuredClone(getStateForShuffleEntry(result.state)), moveTypes: ['meta'] });
      }
      pushHistory({ turn: META_TURN, playerColor: dealerColor, card: null, action: 'deal', description: formatDealDesc(result.state), state: structuredClone(result.state), moveTypes: ['meta'] });
    }

    if (result.winner !== null) {
      setWinMessage(getWinnerLabel(result.winner, state.settings.playerCount) + ' wins!');
    }
  };

  const handleFold = () => {
    if (!state) return;
    const playerIndex = state.currentPlayerIndex ?? 0;
    const playerColor = colors[playerIndex] ?? `P${playerIndex}`;
    let result = foldHand(state);
    const stateForFold = result.stateAfterPlay ?? result.state;
    pushHistory({ turn: history.length, playerColor, card: null, action: 'fold',
      description: `${playerColor} folded`, state: structuredClone(stateForFold), moveTypes: ['fold'] });
    while (result.state.roundPhase === 'play' && ((result.state.hands?.[result.state.currentPlayerIndex ?? 0] ?? []).length === 0)) {
      result = foldHand(result.state);
    }
    setState(result.state);
    setSelectedCardIndex(null);
    if (result.state.roundPhase === 'exchange') {
      const dealerColor = colors[result.state.dealerIndex ?? 0] ?? '';
      if (result.state.shuffledThisRound) {
        pushHistory({ turn: META_TURN, playerColor: dealerColor, card: null, action: 'shuffle', description: formatShuffleDesc(result.state), state: structuredClone(getStateForShuffleEntry(result.state)), moveTypes: ['meta'] });
      }
      pushHistory({ turn: META_TURN, playerColor: dealerColor, card: null, action: 'deal', description: formatDealDesc(result.state), state: structuredClone(result.state), moveTypes: ['meta'] });
    }
  };

  const filteredHistory = historyFilter === 'all'
    ? history
    : history.filter((entry) => (entry.moveTypes ?? []).includes(historyFilter as 'play' | 'split' | 'fold' | 'swap' | 'lock' | 'knockout' | 'meta'));

  const historyViewEntry = historyViewIndex != null && historyViewIndex < history.length ? history[historyViewIndex] : null;
  const highlightedMoverIds = historyViewEntry ? getMoverIdsFromEntry(historyViewEntry) : [];
  const winnerLabel = displayState && checkWin(displayState) ? getWinningTeam(displayState) : null;

  if (!showGame) {
    return (
      <div id="setup-screen" className="setup-screen">
        <h1>New Game</h1>
        <form className="setup-form" onSubmit={handleFormSubmit}>
          <div className="setup-column setup-main">
            <div className="control">
              <label>Players</label>
              <input
                type="number"
                min={2}
                max={12}
                value={setupPlayers}
                onChange={(e) => setSetupPlayers(Math.max(2, Math.min(12, Number(e.target.value) || 4)))}
              />
            </div>
            <div className="control">
              <label>Pawns per player</label>
              <input
                type="number"
                min={1}
                max={8}
                value={setupPawns}
                onChange={(e) => setSetupPawns(Math.max(1, Math.min(8, Number(e.target.value) || 4)))}
              />
            </div>
            <div className="control">
              <label>Track tiles per player</label>
              <input
                type="number"
                min={1}
                max={20}
                value={setupTiles}
                onChange={(e) => setSetupTiles(Math.max(1, Math.min(20, Number(e.target.value) || 14)))}
              />
            </div>
            <div className="control">
              <label>Shuffle mode</label>
              <select value={setupShuffleMode} onChange={(e) => setSetupShuffleMode(e.target.value as 'always' | 'when_needed')}>
                <option value="always">Always (standard rules)</option>
                <option value="when_needed">When needed (card counting)</option>
              </select>
            </div>
            <button type="submit">Start Game</button>
          <button
            type="button"
            onClick={() => {
              const players = Math.max(2, Math.min(12, setupPlayers));
              const pawns = Math.max(1, Math.min(8, setupPawns));
              const tiles = Math.max(1, Math.min(20, setupTiles));
              const settings: GameSettings = { playerCount: players, pawnsPerPlayer: pawns, trackTilesPerPlayer: tiles, shuffleMode: setupShuffleMode };
              const s = startGame(settings);
              const colors = getColorsForPlayerCount(players);
              const greenIdx = colors.indexOf('GREEN');
              const moverId = greenIdx >= 0 ? 'green_0' : `${colors[0].toLowerCase()}_0`;
              const beforeStart = greenIdx >= 0
                ? (s.board.colors.GREEN?.beforeStartIndex ?? 27)
                : (s.board.colors[colors[0]]?.beforeStartIndex ?? 0);
              const testHand: Card[] = [
                { type: 'NUMBER', value: 1 }, { type: 'NUMBER', value: 2 }, { type: 'NUMBER', value: 3 },
                { type: 'NUMBER', value: 5 }, { type: 'NUMBER', value: 6 }, { type: 'NUMBER', value: 9 },
                { type: 'NUMBER', value: 10 }, { type: 'NUMBER', value: 12 },
              ];
              const stateWithHand: GameState = {
                ...s,
                movers: placeMover(s.movers, moverId, `T${beforeStart}` as GameState['movers'][0]['pos']),
                roundPhase: 'play',
                currentPlayerIndex: 0,
                hands: s.hands ? s.hands.map((h, i) => (i === 0 ? testHand : h)) : [testHand, [], [], []].slice(0, players),
              };
              setState(stateWithHand);
              setLayoutConfig(createDefaultBoardLayoutConfig({ playerCount: players, pawnsPerPlayer: pawns, trackTilesPerPlayer: tiles }));
              setHistory([
                { turn: META_TURN, playerColor: '', card: null, action: 'exchange', description: 'Game started', state: structuredClone(getStateForGameStarted(stateWithHand)), moveTypes: ['meta'] },
                { turn: META_TURN, playerColor: colors[0] ?? '', card: null, action: 'deal', description: 'Dealt', state: structuredClone(stateWithHand), moveTypes: ['meta'] },
              ]);
              setHistoryViewIndex(null);
              setLiveState(null);
              setCenterCards([]);
              setSelectedCardIndex(null);
              setWinMessage('');
              setShowGame(true);
            }}
          >
            Load end zone test
          </button>
          </div>
        </form>
      </div>
    );
  }

  if (!displayState) return null;

  const playerIndex = displayState.currentPlayerIndex ?? 0;
  const hand = displayState.hands?.[playerIndex] ?? [];
  const cardLegalActions = hand.map((card) => getLegalActionsForCard(displayState, playerIndex, card));
  const anyLegal = cardLegalActions.some((a) => a.length > 0);
  const selectingPlayer = (displayState.exchangeSelection ?? []).findIndex((s) => s == null);
  const exchangePlayer = selectingPlayer >= 0 ? selectingPlayer : 0;

  return (
    <div className="game-screen">
      <div className="board-container">
        <Board
          state={displayState}
          layoutConfig={layoutConfig}
          highlightPlayerIndex={historyViewIndex == null ? playerIndex : null}
          highlightedMoverIds={historyViewIndex != null ? highlightedMoverIds : undefined}
          centerCards={historyViewIndex != null ? buildCenterCardsFromHistory(history, historyViewIndex) : centerCards}
          deckCount={displayState.deck?.length ?? 0}
          showPlayerHands
          interactive
        />
      </div>
      <aside className="panel">
        <h2>{historyViewIndex != null ? `History — Step ${historyViewIndex}` : 'Play'}</h2>

        {historyViewIndex != null && state && (
          <div className="control">
            <button type="button" onClick={() => { if (liveState) setState(liveState); setLiveState(null); setHistoryViewIndex(null); }}>
              Resume live game
            </button>
          </div>
        )}

        {historyViewIndex == null && displayState.roundPhase === 'exchange' && (
          <div className="control">
            <label>{colors[exchangePlayer] ?? exchangePlayer} – pick card to trade with partner</label>
            <div className="card-row">
              {(displayState.hands?.[exchangePlayer] ?? []).map((card, idx) => (
                <CardComponent key={idx} card={card} onClick={() => handleExchangeSelect(idx)} />
              ))}
            </div>
          </div>
        )}

        {historyViewIndex == null && displayState.roundPhase === 'play' && (
          <>
            <div className="control">
              <label>Current player</label>
              <span style={{ color: getColorHex(colors[playerIndex] ?? 'RED') }}>{colors[playerIndex] ?? `Player ${playerIndex}`}</span>
            </div>
            <div className="control">
              <label>Your hand</label>
              <div className="card-row">
                {hand.map((card, idx) => (
                  <CardComponent
                    key={idx}
                    card={card}
                    selected={selectedCardIndex === idx}
                    disabled={cardLegalActions[idx].length === 0}
                    onClick={() => setSelectedCardIndex(cardLegalActions[idx].length > 0 ? idx : null)}
                  />
                ))}
              </div>
            </div>
            {selectedCardIndex != null && selectedCardIndex < hand.length && cardLegalActions[selectedCardIndex].length > 0 && (
              <div className="actions-panel">
                <div className="actions-panel-label">Actions for {hand[selectedCardIndex].type === 'NUMBER' ? (hand[selectedCardIndex] as { value: number }).value : hand[selectedCardIndex].type}</div>
                {cardLegalActions[selectedCardIndex].map((action, i) => (
                  <div
                    key={i}
                    className="action-item"
                    onClick={() => handlePlayAction(selectedCardIndex, action)}
                  >
                    {formatAction(action)}
                  </div>
                ))}
              </div>
            )}
            <div className="control">
              <button type="button" disabled={anyLegal} onClick={handleFold}>
                Fold (no legal move)
              </button>
            </div>
            <div className="control animate-toggle-control">
              <label>
                <input type="checkbox" checked={animateMovement} onChange={(e) => setAnimateMovement(e.target.checked)} />
                Animate moves
              </label>
            </div>
            {!anyLegal && hand.length > 0 && <p className="fold-hint">No legal moves — click Fold to continue.</p>}
          </>
        )}

        {winMessage && <div className="win-message">{winMessage}</div>}
        <div className="control">
          <button type="button" onClick={() => { setState(null); setShowGame(false); setHistory([]); }}>
            New Game
          </button>
        </div>
      </aside>
      <ResizablePanel>
        <h2>Move history</h2>
        <div className="history-filters">
          {HISTORY_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              data-filter={f}
              className={historyFilter === f ? 'active' : ''}
              onClick={() => setHistoryFilter(f)}
            >
              {HISTORY_FILTER_LABELS[f]}
            </button>
          ))}
        </div>
        <div className="history-list custom-scrollbar">
          {filteredHistory.map((entry) => {
            const idx = history.indexOf(entry);
            if (idx < 0) return null;
            return (
              <HistoryEntryComponent
                key={idx}
                entry={entry}
                isActive={historyViewIndex === idx}
                onClick={() => { setLiveState(state ?? null); setHistoryViewIndex(idx); }}
                dataIndex={idx}
              />
            );
          })}
        </div>
      </ResizablePanel>
    </div>
  );
}

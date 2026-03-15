import { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getPlayerIndex } from '@game/types';
import type { GameResultWithHistory } from '@game/simulation';
import { Board } from '@/components/Board';
import HistoryEntryComponent from '@/components/HistoryEntry';
import ResizablePanel from '@/components/ResizablePanel';
import SimulationResultsGames from '@/components/SimulationResultsGames';
import { type BoardLayoutConfig } from '@/lib/board-layout-config';
import { buildCenterCardsFromHistory } from '@/lib/buildCenterCards';
import { animateActionForReplay, animateDealForReplay, animateExchangeForReplay, animateFoldForReplay } from '@/lib/animate-move';
import type { CenterCard } from '@web-ui/board-renderer';
import { getMoverIdsFromEntry } from '@game/history-format';
import { useSimulation } from '@/contexts/SimulationContext';

export interface ReplayLocationState {
  games: GameResultWithHistory[];
  gameIndex: number;
  playerCount: number;
  playerAliases: string[];
  layoutConfig: BoardLayoutConfig;
}

const HISTORY_FILTERS = ['all', 'play', 'split', 'swap', 'fold', 'lock', 'knockout', 'meta'] as const;
const ANIMATION_BASE_MS = 400;
const MAX_ANIMATION_MULTIPLIER = 20;
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

export default function ReplayPage() {
  const location = useLocation();
  const simContext = useSimulation();
  const navState = location.state as ReplayLocationState | { gameIndex?: number } | null;
  const svgRef = useRef<SVGSVGElement>(null);

  // Prefer SimulationContext to avoid history state size limit (large games with 5+ players).
  // navState may contain only gameIndex when coming from Simulation page.
  const ctxData = simContext?.simulationData;
  const state =
    ctxData && ctxData.games.length > 0
      ? {
          games: ctxData.games,
          gameIndex: navState?.gameIndex ?? 0,
          playerCount: ctxData.playerCount,
          playerAliases: ctxData.playerAliases,
          layoutConfig: ctxData.layoutConfig,
        }
      : navState && (navState as ReplayLocationState).games?.length > 0
        ? (navState as ReplayLocationState)
        : null;
  const applyZoomPanRef = useRef<(() => void) | null>(null);

  const [replayGameIndex, setReplayGameIndex] = useState(state?.gameIndex ?? 0);
  const [replayIndex, setReplayIndex] = useState(0);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [lockLast, setLockLast] = useState(false);
  const [animateMove, setAnimateMove] = useState(true);
  const [replaySpeed, setReplaySpeed] = useState(300);
  const [animationMultiplier, setAnimationMultiplier] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const replayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const replayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPlayingRef = useRef(false);
  const animationAbortControllerRef = useRef<AbortController | null>(null);
  const animationMultiplierRef = useRef(animationMultiplier);
  const replaySpeedRef = useRef(replaySpeed);
  const lastClickTargetRef = useRef<number | null>(null);

  const games = state?.games ?? [];
  const players = state?.playerCount ?? 4;
  const playerAliases = state?.playerAliases ?? [];
  const layoutConfig = state?.layoutConfig ?? null;

  const currentGame = games[replayGameIndex];
  const currentEntry = currentGame?.history[replayIndex];
  const displayState = currentEntry?.state ?? null;
  const filteredHistory = currentGame
    ? (historyFilter === 'all'
        ? currentGame.history
        : currentGame.history.filter((e) => (e.moveTypes ?? []).includes(historyFilter as any)))
    : [];
  const historyViewEntry = currentEntry ? getMoverIdsFromEntry(currentEntry) : [];
  const highlightedHistoryIndex =
    lastClickTargetRef.current != null && replayIndex === lastClickTargetRef.current - 1
      ? lastClickTargetRef.current
      : replayIndex;
  const centerCards: CenterCard[] = currentGame
    ? buildCenterCardsFromHistory(currentGame.history, replayIndex)
    : [];

  useEffect(() => {
    if (state?.gameIndex != null && games.length > 0) {
      setReplayGameIndex(state.gameIndex);
      const game = games[state.gameIndex];
      const startAt = lockLast && game ? Math.max(0, game.history.length - 1) : 0;
      setReplayIndex(startAt);
    }
  }, [state?.gameIndex, games.length]);

  useEffect(() => {
    return () => {
      if (replayTimerRef.current) clearInterval(replayTimerRef.current);
      if (replayTimeoutRef.current) clearTimeout(replayTimeoutRef.current);
      isPlayingRef.current = false;
    };
  }, []);

  const applyBoardTransform = useCallback(() => {
    applyZoomPanRef.current?.();
  }, []);

  const replayIndexRef = useRef(0);
  const historyEntryRefs = useRef<Record<number, HTMLDivElement | null>>({});
  animationMultiplierRef.current = animationMultiplier;
  replaySpeedRef.current = replaySpeed;

  const goToReplayStep = useCallback(
    async (idx: number, options?: { skipAnimation?: boolean }) => {
      if (!currentGame || !layoutConfig || !svgRef.current) return;
      const clampedIdx = Math.max(0, Math.min(idx, currentGame.history.length - 1));
      if (options?.skipAnimation) {
        replayIndexRef.current = clampedIdx;
        setReplayIndex(clampedIdx);
        return;
      }
      const isForwardOne = clampedIdx === replayIndexRef.current + 1;
      const nextEntry = currentGame.history[clampedIdx];
      const action = nextEntry?.action;
      const isActionObject = action && typeof action === 'object' && 'kind' in action;
      const shouldAnimate =
        animateMove &&
        isForwardOne &&
        isActionObject &&
        !isAnimating;

      const shouldAnimateDeal =
        animateMove &&
        isForwardOne &&
        action === 'deal' &&
        !isAnimating;

      const shouldAnimateExchange =
        animateMove &&
        isForwardOne &&
        action === 'exchange' &&
        !isAnimating;

      const shouldAnimateFold =
        animateMove &&
        isForwardOne &&
        action === 'fold' &&
        !isAnimating;

      let wasAborted = false;
      if (shouldAnimateDeal && nextEntry && action === 'deal') {
        const prevEntry = currentGame.history[replayIndexRef.current];
        const controller = new AbortController();
        animationAbortControllerRef.current = controller;
        setIsAnimating(true);
        try {
          const highlightIdx = nextEntry.playerColor
            ? getPlayerIndex(nextEntry.playerColor, players)
            : null;
          await animateDealForReplay({
            svg: svgRef.current!,
            stateBefore: prevEntry.state,
            stateAfter: nextEntry.state,
            layoutConfig,
            getCenterCards: () => buildCenterCardsFromHistory(currentGame.history, clampedIdx),
            stepDelayMs: Math.round(ANIMATION_BASE_MS / animationMultiplierRef.current),
            onFrame: applyBoardTransform,
            highlightPlayerIndex: highlightIdx,
            signal: controller.signal,
          });
        } finally {
          wasAborted = controller.signal.aborted;
          setIsAnimating(false);
          animationAbortControllerRef.current = null;
        }
      } else if (shouldAnimateExchange && nextEntry && action === 'exchange') {
        const prevEntry = currentGame.history[replayIndexRef.current];
        if (!prevEntry) {
          replayIndexRef.current = clampedIdx;
          setReplayIndex(clampedIdx);
          return;
        }
        const controller = new AbortController();
        animationAbortControllerRef.current = controller;
        setIsAnimating(true);
        try {
          await animateExchangeForReplay({
            svg: svgRef.current!,
            stateBefore: prevEntry.state,
            stateAfter: nextEntry.state,
            layoutConfig,
            getCenterCards: () => buildCenterCardsFromHistory(currentGame.history, clampedIdx),
            stepDelayMs: Math.round(ANIMATION_BASE_MS / animationMultiplierRef.current),
            onFrame: applyBoardTransform,
            signal: controller.signal,
          });
        } finally {
          wasAborted = controller.signal.aborted;
          setIsAnimating(false);
          animationAbortControllerRef.current = null;
        }
      } else if (shouldAnimateFold && nextEntry && action === 'fold' && nextEntry.playerColor) {
        const prevEntry = currentGame.history[replayIndexRef.current];
        if (!prevEntry) {
          replayIndexRef.current = clampedIdx;
          setReplayIndex(clampedIdx);
          return;
        }
        const controller = new AbortController();
        animationAbortControllerRef.current = controller;
        setIsAnimating(true);
        try {
          const highlightIdx = getPlayerIndex(nextEntry.playerColor, players);
          await animateFoldForReplay({
            svg: svgRef.current!,
            stateBefore: prevEntry.state,
            stateAfter: nextEntry.state,
            layoutConfig,
            getCenterCards: () => buildCenterCardsFromHistory(currentGame.history, clampedIdx),
            playerColor: nextEntry.playerColor,
            stepDelayMs: Math.round(ANIMATION_BASE_MS / animationMultiplierRef.current),
            onFrame: applyBoardTransform,
            highlightPlayerIndex: highlightIdx,
            signal: controller.signal,
          });
        } finally {
          wasAborted = controller.signal.aborted;
          setIsAnimating(false);
          animationAbortControllerRef.current = null;
        }
      } else if (shouldAnimate && nextEntry && isActionObject) {
        const prevEntry = currentGame.history[replayIndexRef.current];
        const controller = new AbortController();
        animationAbortControllerRef.current = controller;
        setIsAnimating(true);
        try {
          const highlightIdx = nextEntry.playerColor
            ? getPlayerIndex(nextEntry.playerColor, players)
            : null;
          await animateActionForReplay({
            svg: svgRef.current!,
            stateBefore: prevEntry.state,
            action,
            stateAfter: nextEntry.state,
            bumpedPawn: nextEntry.bumpedPawn,
            layoutConfig,
            getCenterCards: () => buildCenterCardsFromHistory(currentGame.history, clampedIdx),
            getCenterCardsBefore: () => buildCenterCardsFromHistory(currentGame.history, clampedIdx - 1),
            playedCard: nextEntry.card && nextEntry.playerColor
              ? { card: nextEntry.card, playerColor: nextEntry.playerColor }
              : undefined,
            stepDelayMs: Math.round(ANIMATION_BASE_MS / animationMultiplierRef.current),
            onFrame: applyBoardTransform,
            highlightPlayerIndex: highlightIdx,
            signal: controller.signal,
          });
        } finally {
          wasAborted = controller.signal.aborted;
          setIsAnimating(false);
          animationAbortControllerRef.current = null;
        }
      }

      if (!wasAborted) {
        replayIndexRef.current = clampedIdx;
        setReplayIndex(clampedIdx);
      }
    },
    [currentGame, layoutConfig, animateMove, isAnimating, players, applyBoardTransform]
  );

  const stopReplay = useCallback(() => {
    animationAbortControllerRef.current?.abort();
    if (replayTimerRef.current) {
      clearInterval(replayTimerRef.current);
      replayTimerRef.current = null;
    }
    if (replayTimeoutRef.current) {
      clearTimeout(replayTimeoutRef.current);
      replayTimeoutRef.current = null;
    }
    isPlayingRef.current = false;
    setIsPlaying(false);
  }, []);

  /** Abort current animation only, without stopping the play loop. */
  const abortAnimationOnly = useCallback(() => {
    animationAbortControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    if (isPlaying) stopReplay();
    // Only run when user toggles "Animate move" - do NOT include isPlaying or stopReplay
    // or we would stop immediately when Play is pressed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animateMove]);

  const handleGameSelect = (idx: number) => {
    if (idx === replayGameIndex) return;
    stopReplay();
    lastClickTargetRef.current = null;
    setReplayGameIndex(idx);
    const game = games[idx];
    const startAt = lockLast && game ? Math.max(0, game.history.length - 1) : 0;
    setReplayIndex(startAt);
  };

  const handlePrev = () => {
    stopReplay();
    lastClickTargetRef.current = null;
    goToReplayStep(replayIndex - 1);
  };
  const handleNext = () => {
    const nextIdx = replayIndex + 1;
    if (nextIdx > maxStep) return;
    lastClickTargetRef.current = null;
    if (isPlaying && isAnimating) {
      abortAnimationOnly();
      replayIndexRef.current = nextIdx;
      setReplayIndex(nextIdx);
    } else {
      stopReplay();
      goToReplayStep(nextIdx);
    }
  };
  replayIndexRef.current = replayIndex;

  const runAnimatePlayLoop = useCallback(async () => {
    if (!currentGame || !layoutConfig || !svgRef.current) return;
    const maxStep = Math.max(0, currentGame.history.length - 1);
    let idx = replayIndexRef.current;
    while (isPlayingRef.current && idx < maxStep) {
      await goToReplayStep(idx + 1);
      idx = replayIndexRef.current;
    }
    stopReplay();
  }, [currentGame, layoutConfig, goToReplayStep, stopReplay]);

  const handlePlay = useCallback(() => {
    if (isPlaying) {
      stopReplay();
      return;
    }
    if (!currentGame || replayIndex >= currentGame.history.length - 1) return;
    const maxStep = Math.max(0, currentGame.history.length - 1);
    if (replayIndex >= maxStep) return;
    lastClickTargetRef.current = null;
    setIsPlaying(true);
    isPlayingRef.current = true;
    if (animateMove) {
      runAnimatePlayLoop();
    } else {
      function scheduleNext() {
        if (!isPlayingRef.current) return;
        const idx = replayIndexRef.current;
        const game = games[replayGameIndex];
        if (!game || idx >= game.history.length - 1) {
          stopReplay();
          return;
        }
        replayTimeoutRef.current = setTimeout(() => {
          goToReplayStep(idx + 1);
          scheduleNext();
        }, replaySpeedRef.current);
      }
      scheduleNext();
    }
  }, [isPlaying, currentGame, replayIndex, animateMove, games, replayGameIndex, runAnimatePlayLoop, goToReplayStep, stopReplay]);

  useEffect(() => {
    if (isPlaying && currentGame && replayIndex >= currentGame.history.length - 1) {
      stopReplay();
    }
  }, [isPlaying, replayIndex, currentGame?.history.length, stopReplay]);

  useEffect(() => {
    historyEntryRefs.current[highlightedHistoryIndex]?.scrollIntoView({ block: 'center' });
  }, [highlightedHistoryIndex]);

  if (!state || games.length === 0 || !layoutConfig) {
    return (
      <div className="sim-setup-view custom-scrollbar">
        <h1 className="sim-page-title">Replay</h1>
        <div className="sim-results-selection-empty" style={{ padding: '2rem' }}>
          <p>Run a simulation, select a game, and click Replay to view it here.</p>
          <p style={{ marginTop: '1rem' }}>
            <Link to="/simulation" className="sim-replay-empty-link">
              Go to Simulation
            </Link>
          </p>
        </div>
      </div>
    );
  }

  if (!displayState) return null;

  const maxStep = Math.max(0, (currentGame?.history.length ?? 1) - 1);

  return (
    <div className="game-screen sim-replay-view">
      <ResizablePanel side="left">
        <h2>Move history</h2>
        <div className="history-filters">
          {HISTORY_FILTERS.map((f) => (
            <button key={f} type="button" data-filter={f} className={historyFilter === f ? 'active' : ''} onClick={() => setHistoryFilter(f)}>
              {HISTORY_FILTER_LABELS[f]}
            </button>
          ))}
        </div>
        <div className="history-list custom-scrollbar">
          {filteredHistory.map((entry, i) => {
            const idx = currentGame!.history.indexOf(entry);
            if (idx < 0) return null;
            return (
              <HistoryEntryComponent
                key={idx}
                ref={(el) => { historyEntryRefs.current[idx] = el; }}
                entry={entry}
                isActive={highlightedHistoryIndex === idx}
                onClick={() => {
                  stopReplay();
                  lastClickTargetRef.current = idx;
                  if (animateMove && idx > 0) {
                    goToReplayStep(idx - 1, { skipAnimation: true });
                    goToReplayStep(idx);
                  } else {
                    goToReplayStep(idx > 0 ? idx - 1 : 0, { skipAnimation: true });
                  }
                }}
                dataIndex={idx}
                showStepIndex
              />
            );
          })}
        </div>
      </ResizablePanel>
      <div className="board-container sim-board-wrap">
        <Board
          state={displayState}
          layoutConfig={layoutConfig}
          highlightPlayerIndex={currentEntry?.playerColor ? getPlayerIndex(currentEntry.playerColor, players) : null}
          highlightedMoverIds={historyViewEntry}
          centerCards={centerCards}
          deckCount={displayState.deck?.length ?? 0}
          showPlayerHands
          interactive
          svgRef={svgRef}
          applyZoomPanRef={applyZoomPanRef}
        />
        <p className="sim-board-hint">Scroll to zoom, drag to pan</p>
      </div>
      <aside className="panel sim-replay-panel">
        <h2>Replay</h2>
        <div className="replay-controls">
          <button type="button" title="First step" onClick={() => { stopReplay(); lastClickTargetRef.current = null; goToReplayStep(0); }} disabled={replayIndex === 0}>|&lt;</button>
          <button type="button" title="Previous step" onClick={handlePrev} disabled={replayIndex === 0}>&lt;</button>
          <button type="button" title="Auto-play" onClick={handlePlay} disabled={replayIndex >= maxStep}>
            {isPlaying ? 'Stop' : 'Play'}
          </button>
          <button type="button" title="Next step" onClick={handleNext} disabled={replayIndex >= maxStep}>&gt;</button>
          <button type="button" title="Last step" onClick={() => { stopReplay(); lastClickTargetRef.current = null; goToReplayStep(maxStep); }} disabled={replayIndex >= maxStep}>&gt;|</button>
          <input
            type="range"
            className="replay-slider"
            min={0}
            max={maxStep}
            value={replayIndex}
            onChange={(e) => { stopReplay(); lastClickTargetRef.current = null; goToReplayStep(Number(e.target.value)); }}
          />
        </div>
        <div className="replay-step-label">Step {replayIndex} / {maxStep}</div>
        <div className="control">
          <label>
            <input type="checkbox" checked={animateMove} onChange={(e) => setAnimateMove(e.target.checked)} />
            Animate move
          </label>
        </div>
        {!animateMove && (
          <div className="control">
            <label>Speed (ms per step)</label>
            <input
              type="range"
              min={50}
              max={2000}
              value={replaySpeed}
              step={50}
              onChange={(e) => setReplaySpeed(Number(e.target.value))}
            />
            <span className="replay-speed">{replaySpeed}ms</span>
          </div>
        )}
        {animateMove && (
          <div className="control">
            <label>Animation speed</label>
            <div className="stepper">
              <button
                type="button"
                className="stepper-btn stepper-btn--decrement"
                title="Decrease speed"
                aria-label="Decrease speed"
                onClick={() => setAnimationMultiplier((m) => Math.max(0.25, m - 0.25))}
                disabled={animationMultiplier <= 0.25}
              >
                <span aria-hidden>−</span>
              </button>
              <div className="stepper-input-wrap">
                <input
                  type="number"
                  className="stepper-input"
                  min={0.25}
                  max={MAX_ANIMATION_MULTIPLIER}
                  step={0.25}
                  value={animationMultiplier}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!Number.isNaN(v)) setAnimationMultiplier(Math.min(MAX_ANIMATION_MULTIPLIER, Math.max(0.25, v)));
                  }}
                  aria-label="Animation speed multiplier"
                />
                <span className="stepper-suffix">×</span>
              </div>
              <button
                type="button"
                className="stepper-btn stepper-btn--increment"
                title="Increase speed"
                aria-label="Increase speed"
                onClick={() => setAnimationMultiplier((m) => Math.min(MAX_ANIMATION_MULTIPLIER, m + 0.25))}
                disabled={animationMultiplier >= MAX_ANIMATION_MULTIPLIER}
              >
                <span aria-hidden>+</span>
              </button>
            </div>
          </div>
        )}
        <div className="sim-results-sidebar sim-replay-games-sidebar">
          <SimulationResultsGames
            games={games}
            playerCount={players}
            playerAliases={playerAliases}
            selectedGameIndex={replayGameIndex}
            onGameClick={handleGameSelect}
            hideReplayButton
            lockLast={lockLast}
            onLockLastChange={setLockLast}
          />
        </div>
      </aside>
    </div>
  );
}

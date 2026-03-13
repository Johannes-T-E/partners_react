export * from './types.js';
export * from './board.js';
export * from './moves.js';
export * from './occupancy.js';
export * from './bump.js';
export * from './legal-moves.js';
export * from './apply.js';
export * from './win.js';
export * from './board-config.js';
export * from './game-state.js';

export { listLegalActions } from './legal-moves.js';
export { applyAction } from './apply.js';
export { resolveBumpAndStackRules } from './bump.js';
export { checkWin } from './win.js';
export { createBoardConfigFromSettings } from './board-config.js';
export { createGameStateFromSettings, createMoversFromSettings } from './game-state.js';
export { createDeck, shuffle, drawCard } from './deck.js';
export {
  startGame,
  advanceTurn,
  playTurn,
  passTurn,
  playFromHand,
  foldHand,
  dealRound,
  applyExchange,
  endRound,
  getCurrentLegalActions,
  getLegalActionsForCard,
  getWinningTeam,
} from './game-loop.js';
export { runGame, runSimulation, runGameWithHistory, createRandomStrategy, createSmartStrategy, createSmartExchangeStrategy, createRandomExchangeStrategy, distanceToEnd, summarizeTurns, computeHistoryStats, computeSingleGameStats } from './simulation.js';
export type { Strategy, ExchangeStrategy, GameResult, GameResultWithHistory, SimulationResult, HistoryEntry, HistoryStats, PerPlayerHistoryStats, SingleGameStats } from './simulation.js';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { GameResultWithHistory, SimulationResult } from '@game/simulation';
import type { GameSettings } from '@game/types';
import type { BoardLayoutConfig } from '@/lib/board-layout-config';

export interface SimulationData {
  result: SimulationResult;
  games: GameResultWithHistory[];
  playerCount: number;
  playerAliases: string[];
  gameSettings: GameSettings;
  layoutConfig: BoardLayoutConfig;
}

interface SimulationContextValue {
  simulationData: SimulationData | null;
  setSimulationData: (data: SimulationData | null) => void;
}

const SimulationContext = createContext<SimulationContextValue | null>(null);

export function SimulationProvider({ children }: { children: ReactNode }) {
  const [simulationData, setSimulationData] = useState<SimulationData | null>(null);
  return (
    <SimulationContext.Provider value={{ simulationData, setSimulationData }}>
      {children}
    </SimulationContext.Provider>
  );
}

export function useSimulation(): SimulationContextValue | null {
  return useContext(SimulationContext);
}

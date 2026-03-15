import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { SmartWeights } from '@game/simulation';
import { DEFAULT_SMART_WEIGHTS } from '@game/index';

const STORAGE_KEY = 'partners-strategy-presets';
const ACTIVE_KEY = 'partners-strategy-active';

export interface StrategyPreset {
  id: string;
  name: string;
  weights: SmartWeights;
  base: 'smart' | 'smartplus';
}

interface StrategyContextValue {
  presets: StrategyPreset[];
  activePresetId: string | null;
  addPreset: (preset: Omit<StrategyPreset, 'id'>) => void;
  updatePreset: (id: string, updates: Partial<Omit<StrategyPreset, 'id'>>) => void;
  removePreset: (id: string) => void;
  setActivePresetId: (id: string | null) => void;
  getActivePreset: () => StrategyPreset | null;
}

const StrategyContext = createContext<StrategyContextValue | null>(null);

function loadPresets(): StrategyPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((p: StrategyPreset) => ({
      ...p,
      weights: { ...DEFAULT_SMART_WEIGHTS, ...p.weights },
    }));
  } catch {
    return [];
  }
}

function savePresets(presets: StrategyPreset[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // ignore
  }
}

export function StrategyProvider({ children }: { children: ReactNode }) {
  const [presets, setPresets] = useState<StrategyPreset[]>(loadPresets);
  const [activePresetId, setActivePresetIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ACTIVE_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    savePresets(presets);
  }, [presets]);

  useEffect(() => {
    try {
      if (activePresetId) localStorage.setItem(ACTIVE_KEY, activePresetId);
      else localStorage.removeItem(ACTIVE_KEY);
    } catch {
      // ignore
    }
  }, [activePresetId]);

  const addPreset = useCallback((preset: Omit<StrategyPreset, 'id'>) => {
    const id = `preset-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setPresets((prev) => [...prev, { ...preset, id }]);
    setActivePresetIdState(id);
  }, []);

  const updatePreset = useCallback((id: string, updates: Partial<Omit<StrategyPreset, 'id'>>) => {
    setPresets((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
    );
  }, []);

  const removePreset = useCallback((id: string) => {
    setPresets((prev) => prev.filter((p) => p.id !== id));
    setActivePresetIdState((curr) => (curr === id ? null : curr));
  }, []);

  const setActivePresetId = useCallback((id: string | null) => {
    setActivePresetIdState(id);
  }, []);

  const getActivePreset = useCallback((): StrategyPreset | null => {
    if (!activePresetId) return null;
    return presets.find((p) => p.id === activePresetId) ?? null;
  }, [activePresetId, presets]);

  return (
    <StrategyContext.Provider
      value={{
        presets,
        activePresetId,
        addPreset,
        updatePreset,
        removePreset,
        setActivePresetId,
        getActivePreset,
      }}
    >
      {children}
    </StrategyContext.Provider>
  );
}

export function useStrategy(): StrategyContextValue | null {
  return useContext(StrategyContext);
}

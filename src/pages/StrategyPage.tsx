import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { DEFAULT_SMART_WEIGHTS } from '@game/index';
import type { SmartWeights } from '@game/simulation';
import { useStrategy } from '@/contexts/StrategyContext';

const WEIGHT_KEYS: (keyof SmartWeights)[] = [
  'progress',
  'bump',
  'start',
  'lock',
  'exposed',
  'partner',
  'lockable',
];

const WEIGHT_LABELS: Record<keyof SmartWeights, string> = {
  progress: 'Progress',
  bump: 'Bump (knockout)',
  start: 'Start',
  lock: 'Lock',
  exposed: 'Exposure (penalty)',
  partner: 'Partner factor',
  lockable: 'Lockable (Smart+ only)',
};

const WEIGHT_DESCRIPTIONS: Record<keyof SmartWeights, string> = {
  progress: 'Own pawns advancing toward end zone',
  bump: 'Opponent pawns sent home',
  start: 'Own pawn moved from home to start',
  lock: 'Own or partner pawn locked in end zone',
  exposed: 'Own pawn alone on track (vulnerable)',
  partner: 'Partner pawns contribute at this fraction of own',
  lockable: 'Pawn in end zone can be locked with remaining hand',
};

function WeightSlider({
  label,
  description,
  value,
  onChange,
  min = -50,
  max = 100,
}: {
  label: string;
  description: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="strategy-weight-row">
      <div className="strategy-weight-label">
        <span className="strategy-weight-name">{label}</span>
        <span className="strategy-weight-desc">{description}</span>
      </div>
      <div className="strategy-weight-controls">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="strategy-weight-slider"
        />
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="strategy-weight-input"
          min={min}
          max={max}
        />
      </div>
    </div>
  );
}

export default function StrategyPage() {
  const strategyCtx = useStrategy();
  const [weights, setWeights] = useState<SmartWeights>(() => ({ ...DEFAULT_SMART_WEIGHTS }));
  const [baseStrategy, setBaseStrategy] = useState<'smart' | 'smartplus'>('smartplus');
  const [presetName, setPresetName] = useState('');
  const [presetNameError, setPresetNameError] = useState('');

  const updateWeight = useCallback((key: keyof SmartWeights, value: number) => {
    setWeights((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetToDefault = useCallback(() => {
    setWeights({ ...DEFAULT_SMART_WEIGHTS });
  }, []);

  const handleSavePreset = useCallback(() => {
    const name = presetName.trim();
    if (!name) {
      setPresetNameError('Enter a name');
      return;
    }
    setPresetNameError('');
    strategyCtx?.addPreset({ name, weights: { ...weights }, base: baseStrategy });
    setPresetName('');
  }, [presetName, weights, baseStrategy, strategyCtx]);

  const handleUsePreset = useCallback(
    (preset: { id: string; weights: SmartWeights; base: 'smart' | 'smartplus' }) => {
      setWeights({ ...preset.weights });
      setBaseStrategy(preset.base);
      strategyCtx?.setActivePresetId(preset.id);
    },
    [strategyCtx]
  );

  return (
    <div className="strategy-page custom-scrollbar">
      <h1 className="strategy-page-title">Strategies</h1>
      <p className="strategy-page-intro">
        Learn how the simulation strategies work, adjust their weights, and create custom presets to use in simulations.
      </p>

      <section className="strategy-docs-section">
        <h2>Strategy documentation</h2>

        <div className="strategy-doc-card">
          <h3>Random</h3>
          <p>
            <strong>Play:</strong> Picks a uniformly random legal action. If there are no legal moves, passes.
          </p>
          <p>
            <strong>Exchange:</strong> Picks a random card to trade with the partner.
          </p>
          <p className="strategy-doc-hint">Use as a baseline for comparison. Games tend to last longer and outcomes are more chaotic.</p>
        </div>

        <div className="strategy-doc-card">
          <h3>Smart</h3>
          <p>
            <strong>Play:</strong> Evaluates each legal action by simulating it and scoring the resulting board state. Chooses the action with the highest score. Uses a small random tiebreaker.
          </p>
          <p>
            <strong>Exchange:</strong> Gives the partner the card most useful to them. If partner has pawns in home → prefer START cards. Otherwise → prefer high-value movement cards.
          </p>
          <p className="strategy-doc-hint">Strong baseline. Balances offense (progress, bumps, locks) with defense (avoids exposed pawns).</p>
        </div>

        <div className="strategy-doc-card">
          <h3>Smart+</h3>
          <p>
            <strong>Play:</strong> Same as Smart, plus <strong>card-aware end zone planning</strong>. Adds a bonus when a pawn in the end zone can be locked with a single card from the remaining hand.
          </p>
          <p>
            This helps the strategy favor moves that set up future locks—e.g., moving a pawn to a slot where the next card can lock it.
          </p>
          <p className="strategy-doc-hint">Strongest strategy. Better at finishing games by planning ahead for end-zone locks.</p>
        </div>
      </section>

      <section className="strategy-weights-section">
        <h2>Customize weights</h2>
        <p className="strategy-weights-intro">
          Adjust the scoring weights for Smart and Smart+ strategies. Higher values make the strategy prioritize that factor more.
        </p>

        <div className="strategy-weights-base">
          <label>Base strategy:</label>
          <select
            value={baseStrategy}
            onChange={(e) => setBaseStrategy(e.target.value as 'smart' | 'smartplus')}
          >
            <option value="smart">Smart</option>
            <option value="smartplus">Smart+</option>
          </select>
        </div>

        <div className="strategy-weights-grid">
          {WEIGHT_KEYS.map((key) => {
            if (key === 'lockable' && baseStrategy === 'smart') return null;
            const min = key === 'exposed' || key === 'partner' ? -50 : 0;
            const max = key === 'partner' ? 2 : 100;
            return (
              <WeightSlider
                key={key}
                label={WEIGHT_LABELS[key]}
                description={WEIGHT_DESCRIPTIONS[key]}
                value={weights[key]}
                onChange={(v) => updateWeight(key, v)}
                min={min}
                max={max}
              />
            );
          })}
        </div>

        <div className="strategy-weights-actions">
          <button type="button" className="strategy-btn-secondary" onClick={resetToDefault}>
            Reset to default
          </button>
        </div>
      </section>

      <section className="strategy-presets-section">
        <h2>Save & use presets</h2>
        <p className="strategy-presets-intro">
          Save your weight configuration as a preset to use in the Simulation page. Select &quot;Custom&quot; as the strategy to use your active preset.
        </p>

        <div className="strategy-save-preset">
          <input
            type="text"
            placeholder="Preset name"
            value={presetName}
            onChange={(e) => {
              setPresetName(e.target.value);
              setPresetNameError('');
            }}
            className={`strategy-preset-input ${presetNameError ? 'strategy-input-error' : ''}`}
          />
          <button type="button" className="strategy-btn-primary" onClick={handleSavePreset}>
            Save preset
          </button>
        </div>
        {presetNameError && <span className="strategy-error-message">{presetNameError}</span>}

        {strategyCtx && strategyCtx.presets.length > 0 && (
          <div className="strategy-presets-list">
            <h3>Saved presets</h3>
            <ul>
              {strategyCtx.presets.map((preset) => (
                <li key={preset.id} className="strategy-preset-item">
                  <span className="strategy-preset-name">{preset.name}</span>
                  <span className="strategy-preset-base">{preset.base}</span>
                  <div className="strategy-preset-actions">
                    <button
                      type="button"
                      className="strategy-btn-small"
                      onClick={() => handleUsePreset(preset)}
                    >
                      Use
                    </button>
                    <button
                      type="button"
                      className="strategy-btn-small strategy-btn-active"
                      onClick={() => strategyCtx.setActivePresetId(preset.id)}
                    >
                      {strategyCtx.activePresetId === preset.id ? 'Active' : 'Set active'}
                    </button>
                    <button
                      type="button"
                      className="strategy-btn-small strategy-btn-danger"
                      onClick={() => strategyCtx.removePreset(preset.id)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="strategy-page-footer">
        <Link to="/simulation" className="strategy-link-simulation">
          Go to Simulation →
        </Link>
      </div>
    </div>
  );
}

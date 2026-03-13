import { useState, useMemo, useCallback } from 'react';
import { COLORS_PALETTE } from '@game/types';
import {
  createDefaultBoardLayoutConfig,
  getBasePaletteForDisplay,
  EXTENDED_PALETTE_SIZE,
  MAX_PLAYER_COUNT,
  type BoardLayoutConfig,
} from '@/lib/board-layout-config';
import { deriveBurstColor, deriveSpotColor } from '@/lib/color-utils';
import {
  getAllBoardThemes,
  saveBoardTheme,
  deleteBoardTheme,
  generateBoardThemeId,
  configToTheme,
  applyThemeToConfig,
  configMatchesTheme,
  CLASSIC_THEME,
  type BoardTheme,
} from '@/lib/board-themes';

interface LayoutFormProps {
  config: BoardLayoutConfig;
  onChange: (config: BoardLayoutConfig) => void;
}

function ColorSwatch({
  color,
  title,
  onChange,
}: {
  color: string;
  title: string;
  onChange: (hex: string) => void;
}) {
  return (
    <div className="color-swatch" style={{ backgroundColor: color }} title={title}>
      <input
        type="color"
        value={color}
        onChange={(e) => onChange(e.target.value)}
        className="color-swatch-input"
        aria-label={title}
      />
    </div>
  );
}

function ThemeSection({
  config,
  writeColorCount,
  onChange,
}: {
  config: BoardLayoutConfig;
  writeColorCount: number;
  onChange: (config: BoardLayoutConfig) => void;
}) {
  const [themeVersion, setThemeVersion] = useState(0);
  const themes = useMemo(() => getAllBoardThemes(), [themeVersion]);

  const selectedThemeId = useMemo(() => {
    const theme = themes.find((t) => configMatchesTheme(config, t));
    return theme?.id ?? 'custom';
  }, [config, themes]);

  const applyTheme = useCallback(
    (theme: BoardTheme) => {
      onChange(createDefaultBoardLayoutConfig(applyThemeToConfig(config, theme)));
    },
    [config, onChange]
  );

  const update = useCallback(
    (overrides: Partial<BoardLayoutConfig>) => {
      const next = createDefaultBoardLayoutConfig({ ...config, ...overrides });
      onChange(next);
    },
    [config, onChange]
  );

  const handleColorChange = useCallback(
    (i: number, hex: string) => {
      if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return;
      const base = [...getBasePaletteForDisplay(config)];
      const needLen = Math.max(base.length, i + 1);
      while (base.length < needLen) base.push('#888888');
      base[i] = hex;
      update({ basePlayerColors: base });
    },
    [config, update]
  );

  const handleAddColor = useCallback(() => {
    const base = [...getBasePaletteForDisplay(config)];
    base.push('#888888');
    update({ basePlayerColors: base });
  }, [config, update]);

  const handleSaveTheme = useCallback(() => {
    const name = window.prompt('Theme name', 'My theme');
    if (!name?.trim()) return;
    const id = generateBoardThemeId();
    const theme = configToTheme(id, name.trim(), config);
    saveBoardTheme(theme);
    setThemeVersion((v) => v + 1);
    applyTheme(theme);
  }, [config, applyTheme]);

  const handleDeleteTheme = useCallback(
    (id: string) => {
      if (id === CLASSIC_THEME.id) return;
      if (!window.confirm('Delete this theme?')) return;
      deleteBoardTheme(id);
      setThemeVersion((v) => v + 1);
      applyTheme(CLASSIC_THEME);
    },
    [applyTheme]
  );

  return (
    <div className="layout-section">
      <h3>Theme</h3>
      <div className="control">
        <label>Preset</label>
        <div className="theme-row">
          <select
            value={selectedThemeId}
            onChange={(e) => {
              const id = e.target.value;
              const theme = themes.find((t) => t.id === id);
              if (theme) applyTheme(theme);
            }}
          >
            <option value="custom">Custom</option>
            {themes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {selectedThemeId !== 'classic' && selectedThemeId !== 'custom' && (
            <button
              type="button"
              className="theme-delete-btn"
              onClick={() => handleDeleteTheme(selectedThemeId)}
              title="Delete theme"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div className="theme-subsection">
        <h4>Style</h4>
        <div className="control">
          <label>
            <input
              type="checkbox"
              checked={config.colorTheme === 'partners'}
              disabled={config.playerCount === 2 || config.playerCount % 2 === 1}
              onChange={(e) => update({ colorTheme: e.target.checked ? 'partners' : 'distinct' })}
            />
            {' '}Partners have same color
          </label>
          <label style={{ display: 'block', marginTop: '0.5rem' }}>
            <input
              type="checkbox"
              checked={config.debugTrackLabels ?? false}
              onChange={(e) => update({ debugTrackLabels: e.target.checked })}
            />{' '}
            Show track labels
          </label>
        </div>
      </div>

      <div className="theme-subsection">
        <h4>Stroke</h4>
        <div className="control">
          <div className="stroke-row">
            <div className="stroke-color-wrap">
              <span className="stroke-color-label">Color</span>
              <div className="color-swatches">
                <ColorSwatch
                  color={config.outlineColor}
                  title="Stroke color"
                  onChange={(hex) => update({ outlineColor: hex })}
                />
              </div>
            </div>
            <div className="stroke-width-wrap">
              <span className="stroke-color-label">Width</span>
              <input
                type="number"
                min={0}
                step={0.1}
                value={config.strokeWidth}
                onChange={(e) => update({ strokeWidth: Math.max(0, Number(e.target.value) || 1.2) })}
                aria-label="Stroke width"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="theme-subsection">
        <h4>Background</h4>
        <div className="control">
          <div className="stroke-color-wrap">
            <span className="stroke-color-label">Color</span>
            <div className="color-swatches">
              <ColorSwatch
                color={config.boardBgColorInner}
                title="Background color"
                onChange={(hex) => update({ boardBgColorInner: hex })}
              />
            </div>
          </div>
        </div>
      </div>

      {writeColorCount > 0 && (() => {
        const basePalette = getBasePaletteForDisplay(config);
        return (
        <div className="theme-subsection">
          <h4>Player colors</h4>
          <div className="control">
            <div className="color-swatches">
              {Array.from({ length: writeColorCount }, (_, i) => i).map((i) => (
                <ColorSwatch
                  key={i}
                  color={basePalette[i] ?? '#000000'}
                  title={`Player ${i} (${COLORS_PALETTE[i] ?? (config.playerColorNames ?? [])[i] ?? String(i)})`}
                  onChange={(hex) => handleColorChange(i, hex)}
                />
              ))}
              {writeColorCount < 24 && (
                <button
                  type="button"
                  className="add-color-btn"
                  onClick={handleAddColor}
                  title="Add color"
                  aria-label="Add color"
                />
              )}
            </div>
          </div>
        </div>
        );
      })()}

      <div className="theme-save-wrap">
        <button
          type="button"
          className="theme-save-btn"
          onClick={handleSaveTheme}
          title="Saves colors, stroke, and background only. Track, arms, and home layout are not saved."
        >
          Save as theme
        </button>
        <p className="theme-save-hint">Colors, stroke &amp; background only</p>
      </div>
    </div>
  );
}

export default function LayoutForm({ config, onChange }: LayoutFormProps) {
  const update = (overrides: Partial<BoardLayoutConfig>) => {
    const next = createDefaultBoardLayoutConfig({ ...config, ...overrides });
    onChange(next);
  };

  const playerCount = config.playerCount;
  const numGroups = config.colorTheme === 'partners' && playerCount >= 2 ? (playerCount === 2 ? 2 : playerCount / 2) : playerCount;
  const requiredColors = config.colorTheme === 'partners' ? numGroups : playerCount;
  const useDynamicColors = playerCount > EXTENDED_PALETTE_SIZE && (config.basePlayerColors?.length ?? config.playerColors?.length ?? 0) < requiredColors;
  const basePaletteLen = getBasePaletteForDisplay(config).length;
  const writeColorCount = Math.min(Math.max(EXTENDED_PALETTE_SIZE, basePaletteLen), 24);

  return (
    <div className="layout-details">
      <h2 className="layout-details-heading">Board layout</h2>
      <div className="layout-sections">
      <div className="layout-section">
        <h3>Structure</h3>
        <div className="control control-inline">
          <label>Players</label>
          <input
            type="number"
            min={2}
            value={config.playerCount}
            onChange={(e) => update({ playerCount: Math.max(2, Math.min(MAX_PLAYER_COUNT, Math.round(Number(e.target.value) || 4))) })}
          />
        </div>
        <div className="control control-inline">
          <label>Track tiles</label>
          <input
            type="number"
            min={1}
            value={config.trackTilesPerPlayer}
            onChange={(e) => update({ trackTilesPerPlayer: Math.max(1, Math.round(Number(e.target.value) || 14)) })}
          />
        </div>
        <div className="control control-inline">
          <label>Pawns</label>
          <input
            type="number"
            min={1}
            value={config.pawnsPerPlayer}
            onChange={(e) => update({ pawnsPerPlayer: Math.max(1, Math.round(Number(e.target.value) || 4)) })}
          />
        </div>
      </div>
      <ThemeSection
        config={config}
        writeColorCount={writeColorCount}
        onChange={onChange}
      />
      <div className="layout-section">
        <h3>Track</h3>
        <div className="control control-inline">
          <label>Center radius</label>
          <input
            type="number"
            min={50}
            value={config.trackCenterRadius}
            onChange={(e) => update({ trackCenterRadius: Math.max(50, Number(e.target.value) || 280) })}
          />
        </div>
        <div className="control control-inline">
          <label>Thickness</label>
          <input
            type="number"
            min={5}
            value={config.trackThickness}
            onChange={(e) => update({ trackThickness: Math.max(5, Number(e.target.value) || 55) })}
          />
        </div>
        <div className="control control-inline">
          <label>Petal radius</label>
          <input
            type="number"
            min={0}
            step={0.5}
            value={config.trackPetalRadius}
            onChange={(e) => update({ trackPetalRadius: Math.max(0, Number(e.target.value) || 30) })}
          />
        </div>
      </div>
      <div className="layout-section">
        <h3>Arms</h3>
        <div className="control control-inline">
          <label>Arm length</label>
          <input
            type="number"
            min={0}
            value={config.armLength}
            onChange={(e) => update({ armLength: Math.max(0, Number(e.target.value) || 82) })}
          />
        </div>
        <div className="control control-inline">
          <label>Arm big circle</label>
          <input
            type="number"
            min={1}
            step={0.5}
            value={config.armBigCircleRadius}
            onChange={(e) => update({ armBigCircleRadius: Math.max(1, Number(e.target.value) || 48) })}
          />
        </div>
        <div className="control control-inline">
          <label title="Pawn circle size on the board (visible in Play/Simulation when pawns are on the board)">Pawn radius</label>
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={config.moverRadius}
            onChange={(e) => update({ moverRadius: Math.max(0.5, Number(e.target.value) || 8) })}
            title="Pawn circle size on the board (visible in Play/Simulation when pawns are on the board)"
          />
        </div>
      </div>
      <div className="layout-section">
        <h3>Home</h3>
        <div className="control control-inline">
          <label>Radius</label>
          <input
            type="number"
            min={1}
            value={config.homeRadius}
            onChange={(e) => update({ homeRadius: Math.max(1, Number(e.target.value) || 24) })}
          />
        </div>
        <div className="control control-inline">
          <label>Spot radius</label>
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={config.homeSpotRadius}
            onChange={(e) => update({ homeSpotRadius: Math.max(0.5, Number(e.target.value) || 12) })}
          />
        </div>
        <div className="control control-inline">
          <label>Spot grid step</label>
          <input
            type="number"
            min={0}
            step={0.5}
            value={config.homeSpotGridStep}
            onChange={(e) => update({ homeSpotGridStep: Math.max(0, Number(e.target.value) || 12) })}
          />
        </div>
        <div className="control control-inline">
          <label>Circle radius</label>
          <input
            type="number"
            min={1}
            step={0.5}
            value={config.homeCircleRadius}
            onChange={(e) => update({ homeCircleRadius: Math.max(1, Number(e.target.value) || 36) })}
          />
        </div>
      </div>
      <div className="layout-section layout-reset">
        <button type="button" onClick={() => onChange(createDefaultBoardLayoutConfig())}>
          Reset layout to default
        </button>
      </div>
      </div>
    </div>
  );
}

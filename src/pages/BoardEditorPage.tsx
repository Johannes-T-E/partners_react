import { useState, useMemo } from 'react';
import { createGameStateFromSettings } from '@game/index';
import { Board } from '@/components/Board';
import LayoutForm from '@/components/LayoutForm';
import { createDefaultBoardLayoutConfig, type BoardLayoutConfig } from '@/lib/board-layout-config';

export default function BoardEditorPage() {
  const [layoutConfig, setLayoutConfig] = useState<BoardLayoutConfig>(() => createDefaultBoardLayoutConfig());

  const boardState = useMemo(() => {
    const settings = {
      playerCount: layoutConfig.playerCount,
      pawnsPerPlayer: layoutConfig.pawnsPerPlayer,
      trackTilesPerPlayer: layoutConfig.trackTilesPerPlayer,
    };
    const state = createGameStateFromSettings(settings);
    return { ...state, movers: [] };
  }, [layoutConfig.playerCount, layoutConfig.pawnsPerPlayer, layoutConfig.trackTilesPerPlayer]);

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
      <div className="board-container board-editor-wrap">
        <Board
          state={boardState}
          layoutConfig={layoutConfig}
          interactive
          highlightPlayerIndex={null}
          showDeck={false}
        />
      </div>
      <aside className="panel">
        <LayoutForm config={layoutConfig} onChange={setLayoutConfig} />
      </aside>
    </div>
  );
}

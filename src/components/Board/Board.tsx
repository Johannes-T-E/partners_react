import { useEffect, useRef, useCallback } from 'react';
import type { GameState, NodeId } from '@game/types';
import {
  renderBoard,
  renderCenterCards,
  renderDeck,
  renderPlayerHandsOnBoard,
  highlightPawns,
  clearPawnHighlights,
  highlightTile,
  clearTileHighlight,
  renderHeatmapOverlay,
  clearHeatmapOverlay,
  type CenterCard,
  type MoverPositionOverride,
  type WinningPlayerIndices,
} from '@web-ui/board-renderer';
import type { BoardLayoutConfig } from '@/lib/board-layout-config';
import type { Card } from '@game/types';
import { getPartnerIndex, partnersExist } from '@game/types';

/** Strip originalOwner except for exchanged cards (partner's card keeps partner's border).
 * - Exchange phase / 2-player: strip all (cards just dealt).
 * - Play with partners: keep originalOwner only when it's the partner (card from exchange). */
function handsForDisplay(state: GameState): Card[][] | undefined {
  const hands = state.hands;
  if (!hands) return hands;
  const playerCount = state.settings?.playerCount ?? 4;
  return hands.map((h, playerIdx) =>
    h.map((card) => {
      const c = card as Card & { originalOwner?: number };
      if (c.originalOwner == null) return card;
      if (state.roundPhase === 'exchange' || !partnersExist(playerCount)) {
        const { originalOwner, ...rest } = c;
        return rest as Card;
      }
      if (c.originalOwner === getPartnerIndex(playerIdx, playerCount)) return card;
      const { originalOwner, ...rest } = c;
      return rest as Card;
    })
  );
}

/** Build CSS background from layout config for container fill. */
function getBoardContainerBackground(layout: BoardLayoutConfig | undefined): string {
  if (!layout) return 'linear-gradient(160deg, #0f172a 0%, #020617 100%)';
  const pct = layout.boardBgPctInner;
  const inner = layout.boardBgColorInner;
  const outer = layout.boardBgColorOuter;
  return `radial-gradient(ellipse farthest-corner at center, ${inner} 0%, ${inner} ${pct}%, ${outer} 100%)`;
}

export interface BoardProps {
  state: GameState;
  layoutConfig?: BoardLayoutConfig;
  highlightPlayerIndex?: number | null;
  highlightedMoverIds?: string[];
  highlightedNodeId?: NodeId | null;
  moverPositionOverrides?: Record<string, MoverPositionOverride>;
  winningPlayerIndices?: WinningPlayerIndices;
  centerCards?: CenterCard[];
  deckCount?: number;
  showDeck?: boolean;
  showPlayerHands?: boolean;
  transform?: string;
  /** Enable wheel zoom and drag pan (like Play/Simulation). */
  interactive?: boolean;
  /** Visit counts per node for heatmap overlay (legacy circles). */
  heatmapData?: Map<NodeId, number>;
  /** Segment-based heatmap: visit counts per circle segment, desaturated board, magma colormap. */
  heatmapSegmentCounts?: number[];
  /** Optional ref to receive the SVG element (e.g. for replay animation). */
  svgRef?: React.MutableRefObject<SVGSVGElement | null>;
  /** Optional ref to receive applyZoomPan (for replay animation onFrame). */
  applyZoomPanRef?: React.MutableRefObject<(() => void) | null>;
}

export default function Board({
  state,
  layoutConfig,
  highlightPlayerIndex,
  highlightedMoverIds,
  highlightedNodeId,
  moverPositionOverrides,
  winningPlayerIndices,
  centerCards = [],
  deckCount,
  showDeck = true,
  showPlayerHands = false,
  transform,
  interactive = false,
  heatmapData,
  heatmapSegmentCounts,
  svgRef: svgRefProp,
  applyZoomPanRef,
}: BoardProps) {
  const internalSvgRef = useRef<SVGSVGElement>(null);
  const svgRef = svgRefProp ?? internalSvgRef;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef({ scale: 1, offsetX: 0, offsetY: 0, isPanning: false, panStart: { clientX: 0, clientY: 0, offsetX: 0, offsetY: 0 } });
  const MIN_ZOOM = 0.25;
  const MAX_ZOOM = 4;

  const applyZoomPan = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const root = svg.querySelector('#board-root') as SVGGElement | null;
    if (!root) return;
    const { scale, offsetX, offsetY } = zoomRef.current;
    root.setAttribute('transform', `translate(${offsetX}, ${offsetY}) scale(${scale})`);
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !interactive) return;

    const zoom = zoomRef.current;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const root = svg.querySelector('#board-root');
      if (!root) return;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const cursorSvg = pt.matrixTransform(ctm.inverse());
      const factor = e.deltaY > 0 ? 1 / 1.05 : 1.05;
      const newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom.scale * factor));
      zoom.offsetX = cursorSvg.x - (cursorSvg.x - zoom.offsetX) * (newScale / zoom.scale);
      zoom.offsetY = cursorSvg.y - (cursorSvg.y - zoom.offsetY) * (newScale / zoom.scale);
      zoom.scale = newScale;
      applyZoomPan();
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      zoom.isPanning = true;
      zoom.panStart = { clientX: e.clientX, clientY: e.clientY, offsetX: zoom.offsetX, offsetY: zoom.offsetY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!zoom.isPanning) return;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const inv = ctm.inverse();
      const dx = e.clientX - zoom.panStart.clientX;
      const dy = e.clientY - zoom.panStart.clientY;
      zoom.offsetX = zoom.panStart.offsetX + inv.a * dx + inv.c * dy;
      zoom.offsetY = zoom.panStart.offsetY + inv.b * dx + inv.d * dy;
      applyZoomPan();
    };

    const onMouseUp = () => { zoom.isPanning = false; };
    const onMouseLeave = () => { zoom.isPanning = false; };

    svg.addEventListener('wheel', onWheel, { passive: false });
    svg.addEventListener('mousedown', onMouseDown);
    svg.addEventListener('mousemove', onMouseMove);
    svg.addEventListener('mouseup', onMouseUp);
    svg.addEventListener('mouseleave', onMouseLeave);
    return () => {
      svg.removeEventListener('wheel', onWheel);
      svg.removeEventListener('mousedown', onMouseDown);
      svg.removeEventListener('mousemove', onMouseMove);
      svg.removeEventListener('mouseup', onMouseUp);
      svg.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [interactive, applyZoomPan]);

  useEffect(() => {
    if (applyZoomPanRef) applyZoomPanRef.current = applyZoomPan;
    return () => { if (applyZoomPanRef) applyZoomPanRef.current = null; };
  }, [applyZoomPan, applyZoomPanRef]);

  /** Fit board to viewport on mount/resize when interactive; slight zoom in (1.05x) from exact fit. */
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !interactive || !layoutConfig) return;

    const viewSize = layoutConfig.viewSize ?? 900;
    const ZOOM_FACTOR = 1.0; // Slightly zoomed in from exact fit
    const fitToViewport = () => {
      const w = wrapper.clientWidth;
      const h = wrapper.clientHeight;
      if (w <= 0 || h <= 0) return;
      const rawScale = Math.min(w / viewSize, h / viewSize) * ZOOM_FACTOR;
      const scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, rawScale));
      zoomRef.current.scale = scale;
      zoomRef.current.offsetX = 0;
      zoomRef.current.offsetY = 0;
      applyZoomPan();
    };

    let rafId = 0;
    const scheduleFit = () => {
      rafId = requestAnimationFrame(() => {
        rafId = requestAnimationFrame(fitToViewport);
      });
    };
    scheduleFit();
    const ro = new ResizeObserver(scheduleFit);
    ro.observe(wrapper);
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [interactive, layoutConfig, applyZoomPan]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const heatmapOptions =
      heatmapSegmentCounts && heatmapSegmentCounts.length > 0
        ? { heatmapMode: true, heatmapSegmentCounts }
        : undefined;
    renderBoard(
      svg,
      state,
      layoutConfig,
      highlightPlayerIndex,
      moverPositionOverrides,
      winningPlayerIndices,
      heatmapOptions
    );

    const deck = deckCount ?? state.deck?.length ?? 0;
    renderCenterCards(svg, centerCards);
    if (showDeck) {
      renderDeck(svg, deck);
    } else {
      const old = svg.querySelector('#center-deck');
      if (old) old.remove();
    }

    if (showPlayerHands && state.hands) {
      const handsToRender = handsForDisplay(state);
      renderPlayerHandsOnBoard(svg, { ...state, hands: handsToRender }, layoutConfig!);
    }

    if (highlightedMoverIds && highlightedMoverIds.length > 0) {
      highlightPawns(svg, highlightedMoverIds);
    } else {
      clearPawnHighlights(svg);
    }

    if (highlightedNodeId && state.board) {
      highlightTile(svg, highlightedNodeId, state.board, layoutConfig!);
    } else {
      clearTileHighlight(svg);
    }

    if (heatmapSegmentCounts && heatmapSegmentCounts.length > 0) {
      clearHeatmapOverlay(svg);
    } else if (heatmapData && heatmapData.size > 0 && state.board && layoutConfig) {
      renderHeatmapOverlay(svg, state.board, layoutConfig, heatmapData);
    } else {
      clearHeatmapOverlay(svg);
    }

    if (interactive) applyZoomPan();
  },   [
    state,
    layoutConfig,
    heatmapData,
    heatmapSegmentCounts,
    highlightPlayerIndex,
    highlightedMoverIds,
    highlightedNodeId,
    moverPositionOverrides,
    winningPlayerIndices,
    centerCards,
    deckCount,
    showDeck,
    showPlayerHands,
    interactive,
    applyZoomPan,
  ]);

  const half = (layoutConfig?.viewSize ?? 900) / 2;
  const viewBox = `${-half} ${-half} ${layoutConfig?.viewSize ?? 900} ${layoutConfig?.viewSize ?? 900}`;

  return (
    <div
      ref={wrapperRef}
      className="board-wrapper"
      style={{ background: getBoardContainerBackground(layoutConfig) }}
    >
      <svg
        ref={svgRef}
        className="board-svg"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        aria-label="PARTNERS board"
        style={transform ? { transform } : undefined}
      />
    </div>
  );
}

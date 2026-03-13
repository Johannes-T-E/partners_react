import { forwardRef } from 'react';
import type { HistoryEntry as HistoryEntryType } from '@game/simulation';
import { pawnIndexFromMoverId, colorFromMoverId } from '@game/history-format';
import { getColorHex } from '@/lib/color-utils';
import MiniPawn from './MiniPawn';
import MiniCard from './MiniCard';
import SwapIcon from './SwapIcon';
import TrashIcon from './TrashIcon';
import LockIcon from './LockIcon';

interface HistoryEntryProps {
  entry: HistoryEntryType;
  isActive: boolean;
  onClick: () => void;
  dataIndex?: number;
  showStepIndex?: boolean;
}

const HistoryEntry = forwardRef<HTMLDivElement, HistoryEntryProps>(function HistoryEntry(
  { entry, isActive, onClick, dataIndex, showStepIndex },
  ref
) {
  const { action, card, playerColor, description } = entry;
  let showDesc = false;

  const content: React.ReactNode[] = [];

  if (typeof action === 'object') {
    if (action.kind === 'swap') {
      if (card) content.push(<MiniCard key="card" card={card} playerColor={playerColor ?? ''} action={action} />);
      content.push(<MiniPawn key="a" color={colorFromMoverId(action.moverIdA)} pawnIndex={pawnIndexFromMoverId(action.moverIdA)} />);
      content.push(<SwapIcon key="swap" size={16} color="var(--ui-text-muted)" className="mini-swap-icon" />);
      content.push(<MiniPawn key="b" color={colorFromMoverId(action.moverIdB)} pawnIndex={pawnIndexFromMoverId(action.moverIdB)} />);
    } else if (action.kind === 'seven_split') {
      if (card) content.push(<MiniCard key="card" card={card} playerColor={playerColor ?? ''} action={action} />);
      for (const part of action.parts) {
        content.push(<MiniPawn key={part.moverId} color={colorFromMoverId(part.moverId)} pawnIndex={pawnIndexFromMoverId(part.moverId)} />);
        content.push(<span key={`${part.moverId}-steps`} className="mini-step-badge">+{part.steps}</span>);
      }
      if (entry.moveTypes?.includes('lock')) {
        content.push(<LockIcon key="lock" size={16} color="var(--ui-text)" className="mini-lock-icon" title="Pawn locked in end zone" />);
      }
      if (entry.bumpedPawn) {
        content.push(<span key="ko" className="mini-knockout" title="Knockout">{'\u2694'}</span>);
        content.push(<MiniPawn key="bumped" color={entry.bumpedPawn.color} pawnIndex={entry.bumpedPawn.pawnNum} />);
      }
    } else {
      if (card) content.push(<MiniCard key="card" card={card} playerColor={playerColor ?? ''} action={action} />);
      const moverId = 'moverId' in action ? action.moverId : (action as { parts?: { moverId: string }[] }).parts?.[0]?.moverId;
      if (moverId) {
        content.push(<MiniPawn key="pawn" color={colorFromMoverId(moverId)} pawnIndex={pawnIndexFromMoverId(moverId)} />);
      }
      if (entry.moveTypes?.includes('lock')) {
        content.push(<LockIcon key="lock" size={16} color="var(--ui-text)" className="mini-lock-icon" title="Pawn locked in end zone" />);
      }
      if (entry.bumpedPawn) {
        content.push(<span key="ko" className="mini-knockout" title="Knockout">{'\u2694'}</span>);
        content.push(<MiniPawn key="bumped" color={entry.bumpedPawn.color} pawnIndex={entry.bumpedPawn.pawnNum} />);
      }
    }
  } else if (action === 'fold' && card) {
    content.push(<MiniCard key="card" card={card} playerColor={playerColor ?? ''} />);
    content.push(<TrashIcon key="fold-icon" size={16} color="var(--ui-text-muted)" className="mini-folded" />);
    content.push(<span key="fold-text" className="history-fold-text">folded their hand</span>);
  } else if (action === 'fold') {
    content.push(<TrashIcon key="fold-icon" size={16} color="var(--ui-text-muted)" className="mini-folded" />);
    content.push(<span key="fold-text" className="history-fold-text">folded their hand</span>);
  } else if (action === 'shuffle' || action === 'deal' || action === 'exchange') {
    showDesc = true;
    content.push(
      <span key="meta" className="mini-meta">
        {action === 'shuffle' ? '\u27F3' : action === 'deal' ? '\u2261' : '\u2699'}
      </span>
    );
  }

  if (showDesc && description) {
    content.push(
      <span key="desc" className="history-desc">
        {description}
      </span>
    );
  }

  const turnLabel = showStepIndex && dataIndex !== undefined
    ? String(dataIndex)
    : (entry.turn >= 0 ? String(entry.turn) : '');

  return (
    <div
      ref={ref}
      className={`history-entry-row${isActive ? ' history-entry-row--active' : ''}`}
      data-history-index={dataIndex}
      onClick={onClick}
      title={!showDesc && description ? description : undefined}
    >
      <span className="history-turn">{turnLabel}</span>
      <div
        className={`history-entry${isActive ? ' history-entry--active' : ''}`}
        style={{ borderLeftColor: playerColor ? getColorHex(playerColor) : 'var(--ui-border)' }}
      >
        {content}
      </div>
    </div>
  );
});

export default HistoryEntry;

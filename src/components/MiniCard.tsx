import type { Card } from '@game/types';
import { getUsedValue } from '@web-ui/board-renderer';
import type { Action } from '@game/types';
import { getColorHex } from '@/lib/color-utils';
import SwapIcon from './SwapIcon';

interface MiniCardProps {
  card: Card | null;
  playerColor: string;
  usedValue?: 'start' | number;
  action?: Action | 'fold' | 'exchange';
}

function getLabel(card: Card | null, usedValue?: 'start' | number, action?: Action | 'fold' | 'exchange'): string {
  if (!card) return '?';
  const uv = usedValue ?? (action && typeof action === 'object' ? getUsedValue(card, action) : getUsedValue(card, 'fold'));
  if (uv !== undefined) return uv === 'start' ? '\u2665' : String(uv);
  if (card.type === 'NUMBER') return String(card.value ?? '?');
  if (card.type === 'START') return '\u2665';
  if (card.type === 'START_OR_8') return '\u2665/8';
  if (card.type === 'START_OR_13') return '\u2665/13';
  if (card.type === 'FOUR_BACK') return '-4';
  if (card.type === 'ONE_OR_14') return '1/14';
  if (card.type === 'SEVEN_SPLIT') return '7';
  if (card.type === 'SWAP') return '';
  return '?';
}

export default function MiniCard({ card, playerColor, usedValue, action }: MiniCardProps) {
  const hex = playerColor ? getColorHex(playerColor) : '#95a5a6';
  const label = getLabel(card, usedValue, action);

  if (card?.type === 'SWAP') {
    return (
      <span className="mini-card mini-card--swap" style={{ borderColor: hex }}>
        <SwapIcon size={18} color="#2c3e50" />
      </span>
    );
  }
  return (
    <span className="mini-card" style={{ borderColor: hex }}>
      {label}
    </span>
  );
}

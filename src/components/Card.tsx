import type { Card as CardType } from '@game/types';
import SwapIcon from './SwapIcon';

interface CardProps {
  card: CardType;
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
  exchangeSelected?: boolean;
}

function getCardValue(card: CardType): string {
  if (card.type === 'NUMBER') return String(card.value);
  if (card.type === 'START') return 'S';
  if (card.type === 'START_OR_8') return 'S/8';
  if (card.type === 'START_OR_13') return 'S/13';
  if (card.type === 'FOUR_BACK') return '-4';
  if (card.type === 'ONE_OR_14') return '1/14';
  if (card.type === 'SEVEN_SPLIT') return '7';
  if (card.type === 'SWAP') return '';
  return '?';
}

function getCardTypeLabel(card: CardType): string {
  if (card.type === 'NUMBER') return '';
  if (card.type === 'START') return 'Start';
  if (card.type === 'START_OR_8') return 'Start/8';
  if (card.type === 'START_OR_13') return 'Start/13';
  if (card.type === 'FOUR_BACK') return 'Back';
  if (card.type === 'ONE_OR_14') return '1 or 14';
  if (card.type === 'SEVEN_SPLIT') return 'Split';
  if (card.type === 'SWAP') return 'Swap';
  return '';
}

function getCardCssClass(card: CardType): string {
  if (card.type === 'NUMBER') return 'card--number';
  if (card.type === 'START' || card.type === 'START_OR_8' || card.type === 'START_OR_13') return 'card--start';
  if (card.type === 'FOUR_BACK') return 'card--four-back';
  if (card.type === 'ONE_OR_14') return 'card--one-or-14';
  if (card.type === 'SEVEN_SPLIT') return 'card--seven-split';
  if (card.type === 'SWAP') return 'card--swap';
  return '';
}

export default function Card({ card, onClick, selected, disabled, exchangeSelected }: CardProps) {
  const classes = [
    'card',
    getCardCssClass(card),
    selected && 'card--selected',
    disabled && 'card--disabled',
    exchangeSelected && 'card--exchange-selected',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      onClick={disabled ? undefined : onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick && !disabled ? 0 : undefined}
      onKeyDown={
        onClick && !disabled
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div className="card-value">
        {card.type === 'SWAP' ? <SwapIcon size={28} color="#2c3e50" /> : getCardValue(card)}
      </div>
      {getCardTypeLabel(card) && <div className="card-type">{getCardTypeLabel(card)}</div>}
    </div>
  );
}

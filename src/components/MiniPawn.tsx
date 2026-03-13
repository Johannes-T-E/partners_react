import { getColorHex } from '@/lib/color-utils';

interface MiniPawnProps {
  color: string;
  pawnIndex: number;
}

export default function MiniPawn({ color, pawnIndex }: MiniPawnProps) {
  return (
    <span
      className="mini-pawn"
      style={{ background: getColorHex(color) }}
    >
      {pawnIndex}
    </span>
  );
}

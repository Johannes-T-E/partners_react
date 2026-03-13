interface LockIconProps {
  size?: number;
  color?: string;
  className?: string;
  title?: string;
}

/** Padlock icon for lock (pawn locked in end zone) action. */
export default function LockIcon({ size = 16, color = 'currentColor', className, title }: LockIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={!title}
      aria-label={title}
    >
      {title && <title>{title}</title>}
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

import { useRef, useEffect } from 'react';

const DEFAULT_MIN = 180;
const DEFAULT_MAX = 500;
const STORAGE_KEY = 'game-partners-history-panel-width';

function getStoredWidth(): number | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= DEFAULT_MIN && n <= DEFAULT_MAX) return n;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function setStoredWidth(w: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(w));
  } catch {
    /* ignore */
  }
}

interface ResizablePanelProps {
  children: React.ReactNode;
  minWidth?: number;
  maxWidth?: number;
  resizeHandleClassName?: string;
  /** 'left' = panel on left, handle on right edge; 'right' = handle on left, panel on right (default). */
  side?: 'left' | 'right';
}

export default function ResizablePanel({
  children,
  minWidth = DEFAULT_MIN,
  maxWidth = DEFAULT_MAX,
  resizeHandleClassName = 'history-panel-resize',
  side = 'right',
}: ResizablePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    const handle = handleRef.current;
    if (!panel || !handle) return;

    const stored = getStoredWidth();
    if (stored != null) {
      panel.style.width = `${stored}px`;
    }

    let startX = 0;
    let startWidth = 0;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      startX = e.clientX;
      startWidth = panel.offsetWidth;

      const onMove = (e2: MouseEvent) => {
        const dx = e2.clientX - startX;
        const delta = side === 'left' ? dx : -dx;
        let w = Math.round(startWidth + delta);
        w = Math.max(minWidth, Math.min(maxWidth, w));
        panel.style.width = `${w}px`;
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        setStoredWidth(panel.offsetWidth);
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    handle.addEventListener('mousedown', onMouseDown);
    return () => handle.removeEventListener('mousedown', onMouseDown);
  }, [minWidth, maxWidth, side]);

  const handleEl = (
    <div
      ref={handleRef}
      className={resizeHandleClassName}
      title="Drag to resize"
    />
  );
  const panelEl = (
    <aside
      ref={panelRef}
      className={`panel history-panel-side${side === 'left' ? ' history-panel-side--left' : ''}`}
    >
      {children}
    </aside>
  );

  return side === 'left' ? (
    <>
      {panelEl}
      {handleEl}
    </>
  ) : (
    <>
      {handleEl}
      {panelEl}
    </>
  );
}

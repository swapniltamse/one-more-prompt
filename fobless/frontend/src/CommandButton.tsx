import { useRef, useState } from "react";

const HOLD_MS = 900;

interface Props {
  icon: string;
  label: string;
  onFire: () => void;
  disabled?: boolean;
  busy?: boolean;
  wide?: boolean;
  /** Require press-and-hold, so a pocket tap can't unlock the car. */
  hold?: boolean;
}

export function CommandButton({ icon, label, onFire, disabled, busy, wide, hold }: Props) {
  const [progress, setProgress] = useState(0);
  const raf = useRef<number>(0);

  function startHold() {
    if (disabled) return;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / HOLD_MS);
      setProgress(p);
      if (p >= 1) {
        setProgress(0);
        navigator.vibrate?.(30);
        onFire();
      } else {
        raf.current = requestAnimationFrame(tick);
      }
    };
    raf.current = requestAnimationFrame(tick);
  }

  function cancelHold() {
    cancelAnimationFrame(raf.current);
    setProgress(0);
  }

  const holdHandlers = hold
    ? {
        onPointerDown: startHold,
        onPointerUp: cancelHold,
        onPointerLeave: cancelHold,
        onPointerCancel: cancelHold,
        onKeyDown: (e: React.KeyboardEvent) => (e.key === "Enter" || e.key === " ") && !e.repeat && startHold(),
        onKeyUp: cancelHold,
        onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
      }
    : { onClick: onFire };

  return (
    <button
      className={`command ${wide ? "wide" : ""} ${busy ? "busy" : ""}`}
      disabled={disabled}
      aria-busy={busy}
      aria-label={hold ? `${label} (press and hold)` : label}
      {...holdHandlers}
    >
      {hold && <span className="hold-fill" style={{ transform: `scaleX(${progress})` }} />}
      <span className="icon" aria-hidden>{busy ? <span className="spinner small" /> : icon}</span>
      <span>{label}</span>
      {hold && <span className="hint">Hold</span>}
    </button>
  );
}

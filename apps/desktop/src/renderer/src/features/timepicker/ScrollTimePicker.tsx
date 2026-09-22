import React, { useEffect, useMemo, useRef, useState } from 'react';
import styles from './ScrollTimePicker.module.css';

// Faithful port of app.js's custom scrolling time-picker wheel
// (buildWheel / getSelected / scrollToValue / updatePreview / setTimeValue).
// The original relied on native <div> scroll + scroll-snap + a scroll event
// listener with a debounce-based "snap to nearest" timeout. That behavior is
// reproduced here via native scrolling (touch/trackpad/wheel all work for
// free through the browser), plus real pointer-drag support
// (onPointerDown/Move/Up) so mouse-drag "flicking" of the wheel works too —
// the vanilla version only got drag for free on touch devices via native
// scroll; desktop mouse-drag needs to be added explicitly, which is the one
// place this port does more than the original rather than less.

const ITEM_H = 44; // matches .wheelItem height in the CSS
const PADDING_ITEMS = 2; // empty spacers top/bottom so first/last can center

function pad2(n: number | string) {
  return String(n).padStart(2, '0');
}

const HOURS = Array.from({ length: 12 }, (_, i) => pad2(i === 0 ? 12 : i));
const MINUTES = Array.from({ length: 60 }, (_, i) => pad2(i));
const AMPM = ['AM', 'PM'];

interface WheelProps {
  values: string[];
  selected: string;
  onSelect: (v: string) => void;
  unit: string;
}

// A single scrollable wheel column. Manages its own scrollTop-driven
// selection, mirroring getSelected()/scrollToValue() from app.js, plus
// pointer-drag physics (drag-to-scroll with a small release "fling").
function Wheel({ values, selected, onSelect, unit }: WheelProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const snapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drag = useRef<{
    active: boolean;
    startY: number;
    startScroll: number;
    lastY: number;
    lastT: number;
    velocity: number;
  } | null>(null);
  const rafRef = useRef<number | null>(null);

  // Scroll to the given value (used on open + when `selected` prop changes externally).
  function scrollToValue(value: string, smooth: boolean) {
    const el = trackRef.current;
    if (!el) return;
    const idx = values.indexOf(value);
    if (idx < 0) return;
    el.scrollTo({ top: idx * ITEM_H, behavior: smooth ? 'smooth' : 'auto' });
  }

  // Mirrors getSelected(): derive the active index from scrollTop.
  function currentIndexFromScroll(): number {
    const el = trackRef.current;
    if (!el) return 0;
    return Math.round(el.scrollTop / ITEM_H);
  }

  useEffect(() => {
    // Initialize scroll position once on mount (like openTimePicker's
    // requestAnimationFrame + scrollToValue calls).
    const raf = requestAnimationFrame(() => scrollToValue(selected, false));
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleScroll() {
    const idx = currentIndexFromScroll();
    const clamped = Math.max(0, Math.min(values.length - 1, idx));
    const v = values[clamped];
    if (v && v !== selected) onSelect(v);

    if (snapTimer.current) clearTimeout(snapTimer.current);
    snapTimer.current = setTimeout(() => {
      // Snap to nearest, like the original's 120ms debounce.
      if (!drag.current?.active) {
        scrollToValue(values[clamped] ?? selected, true);
      }
    }, 120);
  }

  function handleItemClick(v: string) {
    scrollToValue(v, true);
    onSelect(v);
  }

  // --- Pointer drag physics (mouse-drag scrolling; touch already scrolls
  // natively, but pointer events unify both and let us add release momentum) ---
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const el = trackRef.current;
    if (!el) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    drag.current = {
      active: true,
      startY: e.clientY,
      startScroll: el.scrollTop,
      lastY: e.clientY,
      lastT: performance.now(),
      velocity: 0,
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = trackRef.current;
    const d = drag.current;
    if (!el || !d || !d.active) return;
    const dy = e.clientY - d.startY;
    el.scrollTop = d.startScroll - dy;

    const now = performance.now();
    const dt = now - d.lastT;
    if (dt > 0) {
      d.velocity = (e.clientY - d.lastY) / dt; // px/ms, screen-space
    }
    d.lastY = e.clientY;
    d.lastT = now;

    const idx = currentIndexFromScroll();
    const clamped = Math.max(0, Math.min(values.length - 1, idx));
    const v = values[clamped];
    if (v && v !== selected) onSelect(v);
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    const el = trackRef.current;
    const d = drag.current;
    if (!el || !d) return;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    d.active = false;

    // Small momentum fling based on release velocity, then snap.
    let velocity = -d.velocity * 16; // px per animation frame, inverted to match scroll direction
    const maxV = 60;
    velocity = Math.max(-maxV, Math.min(maxV, velocity));

    const step = () => {
      if (!el) return;
      if (Math.abs(velocity) < 0.5) {
        const idx = currentIndexFromScroll();
        const clamped = Math.max(0, Math.min(values.length - 1, idx));
        scrollToValue(values[clamped], true);
        onSelect(values[clamped]);
        rafRef.current = null;
        return;
      }
      el.scrollTop += velocity;
      velocity *= 0.92; // friction
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }

  return (
    <div
      ref={trackRef}
      className={styles.wheel}
      data-unit={unit}
      onScroll={handleScroll}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className={`${styles.wheelItem} ${styles.spacer}`} aria-hidden>&nbsp;</div>
      <div className={`${styles.wheelItem} ${styles.spacer}`} aria-hidden>&nbsp;</div>
      {values.map((v) => (
        <div
          key={v}
          className={`${styles.wheelItem} ${v === selected ? styles.active : ''}`}
          onClick={() => handleItemClick(v)}
        >
          {v}
        </div>
      ))}
      <div className={`${styles.wheelItem} ${styles.spacer}`} aria-hidden>&nbsp;</div>
      <div className={`${styles.wheelItem} ${styles.spacer}`} aria-hidden>&nbsp;</div>
    </div>
  );
}

interface ScrollTimePickerProps {
  /** 24h "HH:MM" string, or empty/undefined for "now". */
  value?: string;
  onChange: (hhmm: string) => void;
  onClose: () => void;
}

// Ports openTimePicker/closeTimePicker/setTimeValue's 24h<->12h conversion
// and the "Set Time" confirm button. This component IS the modal (overlay +
// panel); mount/unmount it to open/close, matching how callers already treat
// modals elsewhere in this codebase (e.g. TaskModal).
export default function ScrollTimePicker({ value, onChange, onClose }: ScrollTimePickerProps) {
  const initial = useMemo(() => {
    let hhmm = value;
    if (!hhmm) {
      const n = new Date();
      hhmm = pad2(n.getHours()) + ':' + pad2(n.getMinutes());
    }
    const [H, M] = hhmm.split(':').map(Number);
    const ampm = H >= 12 ? 'PM' : 'AM';
    const h12 = ((H + 11) % 12) + 1;
    return { hour: pad2(h12), minute: pad2(M), ampm };
  }, [value]);

  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(initial.minute);
  const [ampm, setAmpm] = useState(initial.ampm);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleSet() {
    const h12 = parseInt(hour || '12', 10);
    const m = parseInt(minute || '0', 10);
    let H = h12 % 12;
    if (ampm === 'PM') H += 12;
    onChange(pad2(H) + ':' + pad2(m));
    onClose();
  }

  return (
    <div className={styles.modalOverlay} onClick={handleOverlayClick} style={{ zIndex: 200 }}>
      <div className={styles.modal} role="dialog" aria-modal="true">
        <div className={styles.modalHeader}>
          <h2>Pick a time</h2>
          <button type="button" className={styles.iconBtn} aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className={styles.timePickerBody}>
          <div className={styles.clockPreview}>{`${hour}:${minute} ${ampm}`}</div>
          <div className={styles.wheels}>
            <Wheel unit="hour" values={HOURS} selected={hour} onSelect={setHour} />
            <div className={styles.wheelSep}>:</div>
            <Wheel unit="minute" values={MINUTES} selected={minute} onSelect={setMinute} />
            <Wheel unit="ampm" values={AMPM} selected={ampm} onSelect={setAmpm} />
            <div className={styles.wheelHighlight} />
          </div>
          <div className={styles.modalActions}>
            <button type="button" className={styles.ghostBtn} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className={styles.primaryBtn} onClick={handleSet}>
              Set Time
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

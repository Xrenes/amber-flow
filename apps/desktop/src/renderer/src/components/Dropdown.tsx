import React, { useEffect, useRef, useState } from 'react';
import styles from './Dropdown.module.css';

export interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  // 'bare' drops the trigger's own background/border, for use inside an
  // already-styled wrapper (e.g. AdminToolbar's icon-prefixed pill).
  variant?: 'default' | 'bare';
}

// Theme-matched replacement for a native <select> — the browser/OS renders
// a native select's open list outside CSS's reach, so it can never fully
// match the app's dark glassmorphism theme. Same value/onChange(string)
// API as a native select for easy drop-in use across the app.
export default function Dropdown({
  value,
  options,
  onChange,
  placeholder,
  disabled,
  className,
  variant = 'default',
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    if (open) {
      const idx = Math.max(0, options.findIndex((o) => o.value === value));
      setHighlight(idx);
    }
  }, [open, options, value]);

  useEffect(() => {
    if (open) listRef.current?.children[highlight]?.scrollIntoView({ block: 'nearest' });
  }, [open, highlight]);

  function toggle() {
    if (disabled) return;
    setOpen((v) => !v);
  }

  function pick(v: string) {
    onChange(v);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(options.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (options[highlight]) pick(options[highlight].value);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={`${styles.root} ${className || ''}`}>
      <button
        type="button"
        className={`${styles.trigger} ${variant === 'bare' ? styles.bare : ''} ${disabled ? styles.disabled : ''}`}
        onClick={toggle}
        onKeyDown={onKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? styles.value : styles.placeholder}>
          {selected ? selected.label : placeholder || 'Select…'}
        </span>
        <svg
          className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
          viewBox="0 0 24 24"
          width="13"
          height="13"
          stroke="currentColor"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <ul className={styles.menu} role="listbox" ref={listRef}>
          {options.map((opt, i) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              className={`${styles.option} ${opt.value === value ? styles.optionSelected : ''} ${
                i === highlight ? styles.optionHighlight : ''
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(opt.value);
              }}
              onMouseEnter={() => setHighlight(i)}
            >
              {opt.label}
            </li>
          ))}
          {!options.length && <li className={styles.optionEmpty}>No options</li>}
        </ul>
      )}
    </div>
  );
}

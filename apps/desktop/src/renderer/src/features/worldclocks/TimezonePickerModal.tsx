import React, { useEffect, useMemo, useRef, useState } from 'react';
import { allTimezones, tzLabel, tzOffset, TZ_ALIASES, TZ_ABBR_FOR } from './tzAliases';
import styles from './TimezonePickerModal.module.css';

interface TimezonePickerModalProps {
  existing: string[];
  onPick: (tz: string) => void;
  onClose: () => void;
}

interface FilteredEntry {
  tz: string;
  alias: string | null;
}

// Ports renderTzList()/openAddClock()/closeAddClock() from app.js: alias
// hits (exact abbreviation match) are ranked first, then IANA name/city
// substring matches, capped at 200 results.
function filterTimezones(query: string): FilteredEntry[] {
  const ALL_TZ = allTimezones();
  const q = query.trim().toLowerCase();

  if (!q) {
    return ALL_TZ.map((tz) => ({ tz, alias: null }));
  }

  const aliasHits = new Set<string>();
  Object.entries(TZ_ALIASES).forEach(([abbr, iana]) => {
    if (abbr.toLowerCase().includes(q)) aliasHits.add(iana);
  });

  const seen = new Set<string>();
  const filtered: FilteredEntry[] = [];

  aliasHits.forEach((tz) => {
    if (!seen.has(tz)) {
      seen.add(tz);
      const matchedAbbrs = (TZ_ABBR_FOR[tz] || []).filter((a) => a.toLowerCase().includes(q));
      filtered.push({ tz, alias: matchedAbbrs.join(' / ') });
    }
  });

  ALL_TZ.forEach((tz) => {
    if (!seen.has(tz) && tz.toLowerCase().replace(/_/g, ' ').includes(q)) {
      seen.add(tz);
      filtered.push({ tz, alias: null });
    }
  });

  return filtered;
}

export default function TimezonePickerModal({ existing, onPick, onClose }: TimezonePickerModalProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const filtered = useMemo(() => filterTimezones(query).slice(0, 200), [query]);

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className={styles.modalOverlay} onClick={handleOverlayClick}>
      <div className={styles.modal} role="dialog" aria-modal="true">
        <div className={styles.modalHeader}>
          <h2>Add World Clock</h2>
          <button type="button" className={styles.iconBtn} aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className={styles.modalBody}>
          <label>
            <span>Search timezone or city</span>
            <input
              ref={inputRef}
              type="text"
              autoComplete="off"
              placeholder="e.g. London, New York, Tokyo, Dubai..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className={styles.tzList}>
            {filtered.length === 0 && <div className={styles.tzEmpty}>No timezones found</div>}
            {filtered.map(({ tz, alias }) => {
              const { city, region } = tzLabel(tz);
              const abbrs = TZ_ABBR_FOR[tz];
              const isAdded = existing.includes(tz);
              return (
                <div
                  key={tz}
                  className={styles.tzItem}
                  onClick={() => onPick(tz)}
                  style={isAdded ? { opacity: 0.5 } : undefined}
                >
                  <span>
                    <strong>{city}</strong>
                    <em className={styles.tzRegion}>{region}</em>
                    {alias ? (
                      <span className={styles.tzAbbrTag}>{alias}</span>
                    ) : abbrs && abbrs.length ? (
                      <span className={`${styles.tzAbbrTag} ${styles.dim}`}>{abbrs.join(' / ')}</span>
                    ) : null}
                  </span>
                  <span className={styles.tzOffsetBadge}>{tzOffset(tz)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

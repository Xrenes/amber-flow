import React, { useState } from 'react';
import { useWorldClocks } from './useWorldClocks';
import { tzLabel, tzOffset, currentAbbr, TZ_ABBR_FOR } from './tzAliases';
import TimezonePickerModal from './TimezonePickerModal';
import styles from './WorldClocks.module.css';

// Ports renderClocks()/updateClockTimes() from app.js. Each card recomputes
// its displayed time from `now` (ticked every second by useWorldClocks),
// matching the original's per-second DOM text updates.
function formatClock(tz: string, now: Date) {
  try {
    const h = now.toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: true });
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const m = (parts.find((p) => p.type === 'minute')?.value || '00').padStart(2, '0');
    const ss = (parts.find((p) => p.type === 'second')?.value || '00').padStart(2, '0');
    const ampmStr = h.includes('AM') ? 'AM' : 'PM';
    const h12 = h.replace(/\s?(AM|PM)/i, '').trim();
    const date = now.toLocaleDateString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' });
    return { time: `${h12}:${m}`, secs: `:${ss}`, ampm: ampmStr, date };
  } catch {
    return { time: '--:--', secs: ':--', ampm: '', date: '---' };
  }
}

export default function WorldClocks() {
  const { clocks, now, addClock, removeClock } = useWorldClocks();
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <section className={styles.clocksSection}>
      <div className={styles.clocksHeader}>
        <h2 className={styles.sectionTitle}>
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          World Clocks
        </h2>
        <p className={styles.clocksSub}>Live times across every timezone</p>
      </div>
      <div className={styles.clocksGrid}>
        {clocks.map((tz, idx) => {
          const { city, region } = tzLabel(tz);
          const abbr = currentAbbr(tz);
          const storedAbbrs = (TZ_ABBR_FOR[tz] || []).join(' · ');
          const { time, secs, ampm, date } = formatClock(tz, now);
          return (
            <div
              key={`${tz}-${idx}`}
              className={styles.clockCard}
              style={{ animationDelay: `${idx * 50}ms` }}
            >
              <button
                type="button"
                className={styles.clockRemove}
                title="Remove clock"
                onClick={(e) => {
                  e.stopPropagation();
                  removeClock(idx);
                }}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
              <div className={styles.clockCardTop}>
                <div className={styles.clockAbbr}>{abbr}</div>
                <div className={styles.clockOffset}>{tzOffset(tz)}</div>
              </div>
              <div className={styles.clockCity}>{city}</div>
              <div className={styles.clockRegion}>{tz}</div>
              <div className={styles.clockTimeWrap}>
                <span className={styles.clockTime}>{time}</span>
                <span className={styles.clockSecs}>{secs}</span>
                <span className={styles.clockAmpm}>{ampm}</span>
              </div>
              <div className={styles.clockDate}>{date}</div>
              {storedAbbrs && <div className={styles.clockAllAbbrs}>{storedAbbrs}</div>}
            </div>
          );
        })}
        <button type="button" className={styles.clockAddBtn} title="Add a world clock" onClick={() => setPickerOpen(true)}>
          <span className={styles.clockAddIcon}>
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </span>
          <span className={styles.clockAddLabel}>Add Clock</span>
        </button>
      </div>

      {pickerOpen && (
        <TimezonePickerModal
          existing={clocks}
          onPick={(tz) => {
            addClock(tz);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </section>
  );
}

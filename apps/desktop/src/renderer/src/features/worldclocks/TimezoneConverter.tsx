import React, { useEffect, useMemo, useState } from 'react';
import QuickTimeInput from './QuickTimeInput';
import styles from './WorldClocks.module.css';

// Converts between daylight-saving time zones only (PDT, MDT, CDT, EDT…),
// each a fixed UTC offset, so "3 PM EDT → PDT" converts exactly as typed
// and no date is needed. A clock whose zone has no DST (e.g. Asia/Dhaka) is
// listed with its one offset so it can still be converted.

interface Zone {
  key: string; // "EDT|-240"
  abbr: string; // EDT
  name: string; // Eastern Daylight
  offset: number; // minutes from UTC (EDT = -240)
}

function abbrAt(tz: string, d: Date): string {
  return (
    new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(d)
      .find((p) => p.type === 'timeZoneName')?.value || ''
  );
}

function longNameAt(tz: string, d: Date): string {
  const n =
    new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'long' })
      .formatToParts(d)
      .find((p) => p.type === 'timeZoneName')?.value || tz;
  return n.replace(/ Time$/, '');
}

function offsetMinAt(tz: string, d: Date): number {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(d);
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value || 0);
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'));
  return Math.round((asUtc - Math.floor(d.getTime() / 60000) * 60000) / 60000);
}

function fmtOffset(min: number): string {
  const sign = min < 0 ? '-' : '+';
  const a = Math.abs(min);
  const h = Math.floor(a / 60);
  const m = a % 60;
  return `UTC${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
}

// One zone per clock: its daylight-saving variant, i.e. the larger of its
// January / July offsets (DST moves clocks forward), which also picks the
// right half of the year for southern-hemisphere zones.
function buildZones(clocks: string[]): { zones: Zone[]; keyFor: Record<string, string> } {
  const y = new Date().getFullYear();
  const samples = [new Date(Date.UTC(y, 0, 15, 12)), new Date(Date.UTC(y, 6, 15, 12))];
  const zones: Zone[] = [];
  const keyFor: Record<string, string> = {};
  for (const tz of clocks) {
    try {
      const d = offsetMinAt(tz, samples[1]) > offsetMinAt(tz, samples[0]) ? samples[1] : samples[0];
      const offset = offsetMinAt(tz, d);
      const abbr = abbrAt(tz, d);
      const key = `${abbr}|${offset}`;
      keyFor[tz] = key;
      if (!zones.some((z) => z.key === key)) zones.push({ key, abbr, name: longNameAt(tz, d), offset });
    } catch {
      /* skip invalid zone */
    }
  }
  return { zones, keyFor };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// No date is needed: zones are fixed offsets, so only the time of day
// matters. Times are placed on a fixed reference day so a result that
// crosses midnight can be labelled "next day" / "previous day".
const REF_DAY = Date.UTC(2000, 0, 1);
const DAY_MS = 86_400_000;

function dayOffset(ms: number): number {
  return Math.floor((ms - REF_DAY) / DAY_MS);
}

// Wall-clock instants are stored as "UTC ms shifted by the zone's offset",
// so the UTC getters / timeZone:'UTC' formatting read back that zone's wall time.
function fmtWallTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' });
}

function regionName(z: Zone): string {
  return z.name.replace(/ (Daylight|Standard|Summer)$/, '');
}

// One-click zone buttons, styled like the hour / minute buttons.
function ZoneRow({ label, zones, value, onChange }: { label: string; zones: Zone[]; value: string; onChange: (key: string) => void }) {
  return (
    <div className={`${styles.convPickRow} ${styles.convPickRowCenter}`}>
      <span className={styles.convPickLabel}>{label}</span>
      <div className={styles.convZoneGrid} role="group" aria-label={`${label} time zone`}>
        {zones.map((z) => (
          <button
            key={z.key}
            type="button"
            aria-pressed={z.key === value}
            aria-label={`${z.abbr}, ${z.name}, ${fmtOffset(z.offset)}`}
            title={`${z.name} (${fmtOffset(z.offset)})`}
            className={`${styles.convPick} ${styles.convZone} ${z.key === value ? styles.convPickOn : ''}`}
            onClick={() => onChange(z.key)}
          >
            <span className={styles.convZoneAbbr}>{z.abbr}</span>
            <span className={styles.convZoneName}>{regionName(z)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function TimezoneConverter({ zones: clocks }: { zones: string[] }) {
  const { zones, keyFor } = useMemo(() => buildZones(clocks), [clocks]);
  // Default: last clock → first clock (Eastern → Pacific with the default clocks).
  const defaultFrom = keyFor[clocks[clocks.length - 1]] || zones[0]?.key || '';
  const defaultTo = keyFor[clocks[0]] || zones[1]?.key || defaultFrom;

  const [fromKey, setFromKey] = useState(defaultFrom);
  const [toKey, setToKey] = useState(defaultTo);
  const [time, setTime] = useState('09:00'); // 24h "HH:MM"

  // Keep selections valid if a clock is removed.
  useEffect(() => {
    if (!zones.some((z) => z.key === fromKey)) setFromKey(defaultFrom);
    if (!zones.some((z) => z.key === toKey)) setToKey(defaultTo);
  }, [zones, fromKey, toKey, defaultFrom, defaultTo]);

  const from = zones.find((z) => z.key === fromKey);
  const to = zones.find((z) => z.key === toKey);

  // The entered time in `from` on the reference day, as a UTC instant.
  const utc = useMemo(() => {
    const [H, M] = time.split(':').map(Number);
    if (!from || Number.isNaN(H) || Number.isNaN(M)) return null;
    return REF_DAY + (H * 60 + M - from.offset) * 60_000;
  }, [time, from]);

  const wallIn = (z: Zone) => (utc as number) + z.offset * 60_000;

  // " · next day" / " · previous day" when a zone's time falls on another day.
  function dayShift(ms: number): string {
    const diff = dayOffset(ms);
    return diff > 0 ? ' · next day' : diff < 0 ? ' · previous day' : '';
  }

  function swap() {
    if (utc != null && to) {
      const w = new Date(wallIn(to));
      setTime(`${pad2(w.getUTCHours())}:${pad2(w.getUTCMinutes())}`);
    }
    setFromKey(toKey);
    setToKey(fromKey);
  }

  const others = zones.filter((z) => z.key !== fromKey && z.key !== toKey);

  return (
    <div className={styles.converter}>
      <div className={styles.convTitle}>Time Zone Converter</div>
      <div className={styles.convRow}>
        <div className={styles.convSide}>
          <ZoneRow label="From" zones={zones} value={fromKey} onChange={setFromKey} />
          <QuickTimeInput value={time} onChange={setTime} />
        </div>

        <button type="button" className={styles.convSwap} title="Swap" onClick={swap}>
          ⇄
        </button>

        <div className={styles.convSide}>
          <ZoneRow label="To" zones={zones} value={toKey} onChange={setToKey} />
          <div className={styles.convPickRow}>
            <span aria-hidden="true" />
            <div>
              <div className={styles.convResult}>
                {utc != null && to ? fmtWallTime(wallIn(to)) : '--:--'} <span className={styles.convResultAbbr}>{to?.abbr}</span>
              </div>
              {utc != null && to && (
                <div className={styles.convAbbr}>
                  {dayOffset(wallIn(to)) > 0 ? 'Next day' : dayOffset(wallIn(to)) < 0 ? 'Previous day' : 'Same day'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {utc != null && others.length > 0 && (
        <div className={styles.convOthers}>
          {others.map((z) => (
            <span key={z.key} className={styles.convChip}>
              {regionName(z)}: <b>{fmtWallTime(wallIn(z))}</b> {z.abbr}
              {dayShift(wallIn(z))}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

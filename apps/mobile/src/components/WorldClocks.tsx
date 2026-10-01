import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useWorldClocks } from '../features/worldclocks/useWorldClocks';
import { tzLabel, tzOffset, currentAbbr, TZ_ABBR_FOR } from '../features/worldclocks/tzAliases';
import TimezonePickerModal from './TimezonePickerModal';
import { colors } from '../theme/colors';

// Matches desktop's renderClocks()/updateClockTimes(): per-second recompute
// from `now`, same hour/minute/seconds/AM-PM/date breakdown.
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
    const ampm = h.includes('AM') ? 'AM' : 'PM';
    const h12 = h.replace(/\s?(AM|PM)/i, '').trim();
    const date = now.toLocaleDateString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' });
    return { time: `${h12}:${m}`, secs: `:${ss}`, ampm, date };
  } catch {
    return { time: '--:--', secs: ':--', ampm: '', date: '---' };
  }
}

// Mobile port of the desktop World Clocks widget — same content per card
// (abbreviation, offset badge, city, region, big time with dimmer seconds,
// AM/PM, date, all stored abbreviations) and the same 2-per-row grid
// desktop itself collapses to below 900px, laid out with flexWrap so it
// reflows correctly at any phone width instead of horizontal-scrolling.
export default function WorldClocks() {
  const { clocks, now, addClock, removeClock } = useWorldClocks();
  const [pickerOpen, setPickerOpen] = useState(false);
  const { width } = useWindowDimensions();

  // Two cards per row: card width = (available width - gap) / 2, computed
  // from the actual screen width rather than a fixed pixel guess so it
  // stays correct across phone sizes (iPhone 7 Plus through 13 Pro Max) and
  // adapts on rotation/tablets too.
  const gap = 10;
  const containerPadding = 32; // 16px page padding × 2
  const cardWidth = (width - containerPadding - gap) / 2;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <View style={styles.headerTextCol}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>World Clocks</Text>
            <TouchableOpacity
              style={styles.addIconBtn}
              onPress={() => setPickerOpen(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="plus" size={16} color={colors.accent} />
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>Live times across every timezone</Text>
        </View>
      </View>
      <View style={styles.grid}>
        {clocks.map((tz, idx) => {
          const { city, region } = tzLabel(tz);
          const abbr = currentAbbr(tz);
          const storedAbbrs = (TZ_ABBR_FOR[tz] || []).join(' · ');
          const { time, secs, ampm, date } = formatClock(tz, now);
          return (
            <View key={`${tz}-${idx}`} style={[styles.card, { width: cardWidth }]}>
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => removeClock(idx)}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Feather name="x" size={12} color={colors.textDim} />
              </TouchableOpacity>
              <View style={styles.cardTop}>
                <Text style={styles.abbr}>{abbr}</Text>
                <View style={styles.offsetBadge}>
                  <Text style={styles.offsetText}>{tzOffset(tz)}</Text>
                </View>
              </View>
              <Text style={styles.city} numberOfLines={1}>
                {city}
              </Text>
              {region ? (
                <Text style={styles.region} numberOfLines={1}>
                  {region}
                </Text>
              ) : null}
              <View style={styles.timeRow}>
                <Text style={styles.time}>{time}</Text>
                <Text style={styles.secs}>{secs}</Text>
                <Text style={styles.ampm}> {ampm}</Text>
              </View>
              <Text style={styles.date}>{date}</Text>
              {storedAbbrs ? <Text style={styles.allAbbrs}>{storedAbbrs}</Text> : null}
            </View>
          );
        })}
      </View>

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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 24 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  headerTextCol: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  addIconBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 122, 24, 0.12)',
  },
  subtitle: { fontSize: 11, color: colors.textDim, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  removeBtn: { position: 'absolute', top: 8, right: 8, zIndex: 1 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  abbr: { fontSize: 18, fontWeight: '800', color: colors.accent, letterSpacing: 0.4 },
  offsetBadge: {
    backgroundColor: 'rgba(255, 122, 24, 0.1)',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  offsetText: { fontSize: 10, fontWeight: '700', color: colors.accent },
  city: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: 2 },
  region: { fontSize: 10, color: 'rgba(154, 160, 173, 0.6)', marginBottom: 6 },
  timeRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 4 },
  time: { fontSize: 22, fontWeight: '800', color: colors.accent2, fontVariant: ['tabular-nums'] },
  secs: { fontSize: 14, fontWeight: '600', color: 'rgba(255, 179, 71, 0.5)', fontVariant: ['tabular-nums'] },
  ampm: { fontSize: 11, fontWeight: '700', color: colors.accent, letterSpacing: 0.3 },
  date: { fontSize: 10, color: colors.textDim, marginTop: 4 },
  allAbbrs: { fontSize: 9, color: colors.textDim, marginTop: 6, letterSpacing: 0.3 },
});

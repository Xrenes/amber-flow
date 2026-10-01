import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../theme/colors';

interface ArcGaugeProps {
  pct: number; // 0-100, how much of the arc to fill (daily goal progress)
  size?: number;
  strokeWidth?: number;
  centerText: string; // the big number/time shown in the middle
  centerLabel?: string;
}

// Half-circle progress gauge (180°, left-to-right sweep) — the arc fill
// represents progress toward the daily goal, the center text shows today's
// literal elapsed tracked time (HH:MM:SS), matching the reference design's
// "big number + arc" layout.
export default function ArcGauge({ pct, size = 220, strokeWidth = 18, centerText, centerLabel }: ArcGaugeProps) {
  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const clamped = Math.max(0, Math.min(100, pct));

  // Half circle: from angle 180° (left) to 0° (right), sweeping through the top.
  const startAngle = 180;
  const endAngle = 180 - (clamped / 100) * 180;

  function polarToCartesian(angleDeg: number) {
    const angleRad = (angleDeg * Math.PI) / 180;
    return { x: cx + radius * Math.cos(angleRad), y: cy - radius * Math.sin(angleRad) };
  }

  const trackStart = polarToCartesian(180);
  const trackEnd = polarToCartesian(0);
  const trackPath = `M ${trackStart.x} ${trackStart.y} A ${radius} ${radius} 0 1 1 ${trackEnd.x} ${trackEnd.y}`;

  const fillStart = polarToCartesian(startAngle);
  const fillEnd = polarToCartesian(endAngle);
  const largeArc = clamped > 50 ? 1 : 0;
  const fillPath =
    clamped > 0 ? `M ${fillStart.x} ${fillStart.y} A ${radius} ${radius} 0 ${largeArc} 1 ${fillEnd.x} ${fillEnd.y}` : '';

  return (
    <View style={[styles.wrap, { width: size, height: size / 2 + strokeWidth }]}>
      <Svg width={size} height={size / 2 + strokeWidth / 2}>
        <Path d={trackPath} stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth} strokeLinecap="round" fill="none" />
        {fillPath !== '' && (
          <Path d={fillPath} stroke={colors.accent} strokeWidth={strokeWidth} strokeLinecap="round" fill="none" />
        )}
      </Svg>
      <View style={styles.centerWrap}>
        <Text style={[styles.centerText, { fontSize: Math.round(size * 0.135) }]} numberOfLines={1} adjustsFontSizeToFit>
          {centerText}
        </Text>
        {centerLabel ? (
          <Text style={[styles.centerLabel, { fontSize: Math.max(10, Math.round(size * 0.052)) }]}>{centerLabel}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  centerWrap: {
    position: 'absolute',
    bottom: 4,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  centerText: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  centerLabel: {
    fontSize: 12,
    color: colors.textDim,
    marginTop: 2,
    fontWeight: '600',
  },
});

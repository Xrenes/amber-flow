import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';

interface TopBarProps {
  title?: string;
  right?: React.ReactNode;
}

// Matches the desktop app's topbar exactly (MainPage.module.css): the
// real logo image, "Amber Flow" wordmark, and a small tagline/section
// title underneath — used at the top of every tab so mobile reads as the
// same product as desktop, not a separately-designed app. `title` replaces
// the tagline when a screen wants to show its own section name (e.g. "Tasks").
// Sign out no longer lives here — it moved to the Settings tab, which now
// has a real home of its own.
export default function TopBar({ title, right }: TopBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
      <View style={styles.brand}>
        <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
        <View>
          <Text style={styles.wordmark}>Amber Flow</Text>
          <Text style={styles.tagline}>{title || 'Never miss a follow-up'}</Text>
        </View>
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  logo: {
    width: 30,
    height: 30,
  },
  wordmark: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
  },
  tagline: {
    fontSize: 11,
    color: colors.textDim,
    marginTop: 1,
  },
});

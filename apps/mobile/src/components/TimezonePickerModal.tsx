import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, FlatList, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { allTimezones, tzLabel, tzOffset, TZ_ALIASES, TZ_ABBR_FOR } from '../features/worldclocks/tzAliases';
import { colors } from '../theme/colors';

interface TimezonePickerModalProps {
  existing: string[];
  onPick: (tz: string) => void;
  onClose: () => void;
}

interface FilteredEntry {
  tz: string;
  alias: string | null;
}

// Same ranking as desktop's filterTimezones: exact-abbreviation alias hits
// first, then IANA name/city substring matches, capped at 200 results.
function filterTimezones(query: string): FilteredEntry[] {
  const ALL_TZ = allTimezones();
  const q = query.trim().toLowerCase();

  if (!q) return ALL_TZ.map((tz) => ({ tz, alias: null }));

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
  const insets = useSafeAreaInsets();
  const filtered = useMemo(() => filterTimezones(query).slice(0, 200), [query]);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: 12 + insets.bottom }]}>
          <View style={styles.header}>
            <Text style={styles.title}>Add World Clock</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={18} color={colors.textDim} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.input}
            placeholder="e.g. London, New York, Tokyo, Dubai..."
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            value={query}
            onChangeText={setQuery}
          />
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.tz}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={styles.empty}>No timezones found</Text>}
            renderItem={({ item }) => {
              const { city, region } = tzLabel(item.tz);
              const abbrs = TZ_ABBR_FOR[item.tz];
              const isAdded = existing.includes(item.tz);
              const tag = item.alias || (abbrs && abbrs.length ? abbrs.join(' / ') : null);
              return (
                <TouchableOpacity style={[styles.row, isAdded && styles.rowAdded]} onPress={() => onPick(item.tz)}>
                  <View style={styles.rowLeft}>
                    <Text style={styles.city}>{city}</Text>
                    {region ? <Text style={styles.region}>{region}</Text> : null}
                    {tag ? <Text style={styles.tag}>{tag}</Text> : null}
                  </View>
                  <Text style={styles.offset}>{tzOffset(item.tz)}</Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '85%',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  input: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
    marginBottom: 12,
  },
  list: { maxHeight: 380 },
  empty: { color: colors.textDim, textAlign: 'center', padding: 24, fontSize: 13 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowAdded: { opacity: 0.5 },
  rowLeft: { flex: 1, marginRight: 10 },
  city: { fontSize: 15, fontWeight: '700', color: colors.text },
  region: { fontSize: 12, color: colors.textDim, marginTop: 1 },
  tag: { fontSize: 11, fontWeight: '700', color: colors.accent, marginTop: 3 },
  offset: { fontSize: 12, fontWeight: '600', color: colors.textDim },
});

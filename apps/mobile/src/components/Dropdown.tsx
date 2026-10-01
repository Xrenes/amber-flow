import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';

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
}

// Modal-based picker — RN has no native <select>, so this mirrors the
// desktop app's custom Dropdown component visually (dark theme, amber
// accent) with a simple bottom-sheet-style list instead of a popover.
export default function Dropdown({ value, options, onChange, placeholder, disabled }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const selected = options.find((o) => o.value === value);

  return (
    <>
      <TouchableOpacity
        style={[styles.trigger, disabled && styles.disabled]}
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
      >
        <Text style={selected ? styles.value : styles.placeholder} numberOfLines={1}>
          {selected ? selected.label : placeholder || 'Select…'}
        </Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={[styles.sheet, { paddingBottom: 8 + insets.bottom }]}>
            <FlatList
              data={options}
              keyExtractor={(o) => o.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.option, item.value === value && styles.optionSelected]}
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                >
                  <Text style={[styles.optionText, item.value === value && styles.optionTextSelected]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.empty}>No options</Text>}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  disabled: { opacity: 0.5 },
  value: { color: colors.text, fontSize: 14 },
  placeholder: { color: colors.textDim, fontSize: 14 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bg1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
    paddingVertical: 8,
  },
  option: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  optionSelected: {
    backgroundColor: 'rgba(255, 122, 24, 0.1)',
  },
  optionText: { color: colors.text, fontSize: 15 },
  optionTextSelected: { color: colors.accent, fontWeight: '700' },
  empty: { color: colors.textDim, textAlign: 'center', padding: 20 },
});

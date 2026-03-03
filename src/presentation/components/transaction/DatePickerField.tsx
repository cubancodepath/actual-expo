import { useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../../providers/ThemeProvider';
import { Text } from '../atoms/Text';
import { formatDateLong, formatInputDate, intToStr, strToInt } from '../../../lib/date';
import type { Theme } from '../../../theme';

// Conditionally import SwiftUI DatePicker on iOS
let SwiftDatePicker: typeof import('@expo/ui/swift-ui').DatePicker | null = null;
let Host: typeof import('@expo/ui/swift-ui').Host | null = null;
let datePickerStyleMod: typeof import('@expo/ui/swift-ui/modifiers').datePickerStyle | null = null;
if (Platform.OS === 'ios') {
  try {
    const swiftUI = require('@expo/ui/swift-ui');
    SwiftDatePicker = swiftUI.DatePicker;
    Host = swiftUI.Host;
    const mods = require('@expo/ui/swift-ui/modifiers');
    datePickerStyleMod = mods.datePickerStyle;
  } catch {
    // Fallback — @expo/ui not available
  }
}

/** Convert a Date object to YYYYMMDD integer */
function dateToInt(d: Date): number {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return parseInt(`${y}${m}${day}`, 10);
}

/** Convert YYYYMMDD integer to Date object */
function intToDate(d: number): Date {
  const s = String(d);
  return new Date(
    parseInt(s.slice(0, 4), 10),
    parseInt(s.slice(4, 6), 10) - 1,
    parseInt(s.slice(6, 8), 10),
  );
}

interface DatePickerFieldProps {
  dateInt: number;
  dateStr: string;
  onDateChange: (dateInt: number, dateStr: string) => void;
}

export function DatePickerField({ dateInt, dateStr, onDateChange }: DatePickerFieldProps) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const [showPicker, setShowPicker] = useState(false);

  return (
    <>
      <Pressable
        style={styles.row}
        onPress={() => setShowPicker(!showPicker)}
      >
        <View style={styles.left}>
          <Ionicons name="calendar-outline" size={18} color={theme.colors.textMuted} />
          <Text variant="body" color={theme.colors.textPrimary} style={styles.label}>
            {formatDateLong(dateInt)}
          </Text>
        </View>
        <Ionicons
          name={showPicker ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={theme.colors.textMuted}
        />
      </Pressable>
      {showPicker && (
        Platform.OS === 'ios' && SwiftDatePicker && Host && datePickerStyleMod ? (
          <View style={styles.pickerContainer}>
            <Host matchContents={{ vertical: true }}>
              <SwiftDatePicker
                selection={intToDate(dateInt)}
                displayedComponents={['date']}
                modifiers={[datePickerStyleMod('graphical')]}
                onDateChange={(d) => {
                  const newInt = dateToInt(d);
                  onDateChange(newInt, intToStr(newInt));
                  setShowPicker(false);
                }}
              />
            </Host>
          </View>
        ) : (
          <View style={styles.pickerContainer}>
            <TextInput
              style={styles.textInput}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.colors.textMuted}
              value={dateStr}
              onChangeText={(v) => {
                const formatted = formatInputDate(v);
                const parsed = strToInt(formatted);
                onDateChange(parsed ?? dateInt, formatted);
              }}
              keyboardType="number-pad"
              maxLength={10}
              autoFocus
            />
          </View>
        )
      )}
    </>
  );
}

const createStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  left: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flex: 1,
  },
  label: {
    marginLeft: theme.spacing.sm,
  },
  pickerContainer: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
  textInput: {
    backgroundColor: theme.colors.inputBackground,
    color: theme.colors.textPrimary,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: 16,
    borderWidth: theme.borderWidth.default,
    borderColor: theme.colors.inputBorder,
  },
});

import { Platform, ScrollView, Switch, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, useThemedStyles } from "../../../src/presentation/providers/ThemeProvider";
import {
  Text,
  Card,
  ListItem,
  SectionHeader,
} from "../../../src/presentation/components";
import { usePreferencesStore } from "../../../src/stores/preferencesStore";
import { useFeatureFlagsStore } from "../../../src/stores/featureFlagsStore";
import {
  ALL_FEATURE_FLAGS,
  FEATURE_FLAG_LABELS,
} from "../../../src/preferences/featureFlags";
import {
  DATE_FORMAT_OPTIONS,
  NUMBER_FORMAT_OPTIONS,
  DAY_OF_WEEK_OPTIONS,
} from "../../../src/preferences/types";
import { currencies, getCurrency } from "../../../src/lib/currencies";
import type { Theme } from "../../../src/theme";

// Conditionally import SwiftUI Picker on iOS
let SwiftPicker: typeof import('@expo/ui/swift-ui').Picker | null = null;
let SwiftText: typeof import('@expo/ui/swift-ui').Text | null = null;
let Host: typeof import('@expo/ui/swift-ui').Host | null = null;
let tagMod: typeof import('@expo/ui/swift-ui/modifiers').tag | null = null;
let pickerStyleMod: typeof import('@expo/ui/swift-ui/modifiers').pickerStyle | null = null;
let tintMod: typeof import('@expo/ui/swift-ui/modifiers').tint | null = null;
let frameMod: typeof import('@expo/ui/swift-ui/modifiers').frame | null = null;

if (Platform.OS === 'ios') {
  try {
    const swiftUI = require('@expo/ui/swift-ui');
    SwiftPicker = swiftUI.Picker;
    SwiftText = swiftUI.Text;
    Host = swiftUI.Host;
    const mods = require('@expo/ui/swift-ui/modifiers');
    tagMod = mods.tag;
    pickerStyleMod = mods.pickerStyle;
    tintMod = mods.tint;
    frameMod = mods.frame;
  } catch {
    // Fallback — @expo/ui not available
  }
}

function PickerRow({
  label,
  selection,
  options,
  onSelectionChange,
  showSeparator,
}: {
  label: string;
  selection: string;
  options: { value: string; label: string }[];
  onSelectionChange: (value: string) => void;
  showSeparator?: boolean;
}) {
  const { colors } = useTheme();

  const selectedLabel = options.find((o) => o.value === selection)?.label ?? selection;

  const picker =
    SwiftPicker && SwiftText && Host && tagMod && pickerStyleMod ? (
      <View style={{ alignItems: 'flex-end' }}>
        <Host matchContents>
          <SwiftPicker
            selection={selection}
            onSelectionChange={(val) => onSelectionChange(val as string)}
            modifiers={[pickerStyleMod('menu'), ...(tintMod ? [tintMod(colors.primary)] : []), ...(frameMod ? [frameMod({ minWidth: 170, alignment: 'trailing' })] : [])]}
          >
            {options.map((opt) => (
              <SwiftText key={opt.value} modifiers={[tagMod(opt.value)]}>
                {opt.label}
              </SwiftText>
            ))}
          </SwiftPicker>
        </Host>
      </View>
    ) : (
      <Text variant="bodySm" color={colors.primary}>
        {selectedLabel}
      </Text>
    );

  return <ListItem title={label} right={picker} showSeparator={showSeparator} />;
}

export default function BudgetSettingsScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();

  const prefs = usePreferencesStore();
  const {
    dateFormat, numberFormat, firstDayOfWeekIdx, hideFraction,
    defaultCurrencyCode, currencySymbolPosition,
    currencySpaceBetweenAmountAndSymbol, defaultCurrencyCustomSymbol,
    set,
  } = prefs;
  const featureFlags = useFeatureFlagsStore();

  const hasCurrency = defaultCurrencyCode !== '';

  const dateOptions = DATE_FORMAT_OPTIONS.map((o) => ({
    value: o.value,
    label: o.example,
  }));

  const numberOptions = NUMBER_FORMAT_OPTIONS.map((o) => ({
    value: o.value,
    label: o.example,
  }));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
      contentInsetAdjustmentBehavior="automatic"
    >
      {/* Formatting */}
      <SectionHeader title="Formatting" style={{ marginTop: spacing.lg }} />
      <Card>
        <PickerRow
          label="Date Format"
          selection={dateFormat}
          options={dateOptions}
          onSelectionChange={(v) => set('dateFormat', v)}
          showSeparator
        />
        <PickerRow
          label="Number Format"
          selection={numberFormat}
          options={numberOptions}
          onSelectionChange={(v) => set('numberFormat', v)}
          showSeparator
        />
        <ListItem
          title="Hide Decimal Places"
          onPress={() => set('hideFraction', hideFraction === 'true' ? 'false' : 'true')}
          right={
            <Switch
              value={hideFraction === 'true'}
              onValueChange={(v) => set('hideFraction', v ? 'true' : 'false')}
              trackColor={{ true: colors.primary }}
              accessibilityLabel="Hide decimal places"
            />
          }
        />
      </Card>

      {/* Currency — gated by feature flag */}
      {featureFlags.currency && (
        <>
          <SectionHeader title="Currency" style={{ marginTop: spacing.xl }} />
          <Card>
            <PickerRow
              label="Currency"
              selection={defaultCurrencyCode}
              options={currencies.map((c) => ({
                value: c.code,
                label: c.code ? `${c.code} (${c.symbol})` : 'None',
              }))}
              onSelectionChange={(code) => {
                const cur = getCurrency(code);
                set('defaultCurrencyCode', code);
                if (code) {
                  set('numberFormat', cur.numberFormat);
                  set('hideFraction', cur.decimalPlaces === 0 ? 'true' : 'false');
                  set('currencySymbolPosition', cur.symbolFirst ? 'before' : 'after');
                  set('currencySpaceBetweenAmountAndSymbol', cur.symbolFirst ? 'false' : 'true');
                  set('defaultCurrencyCustomSymbol', '');
                }
              }}
              showSeparator={hasCurrency}
            />
            {hasCurrency && (
              <>
                <PickerRow
                  label="Symbol Position"
                  selection={currencySymbolPosition || 'before'}
                  options={[
                    { value: 'before', label: 'Before' },
                    { value: 'after', label: 'After' },
                  ]}
                  onSelectionChange={(v) => set('currencySymbolPosition', v)}
                  showSeparator
                />
                <ListItem
                  title="Space Between"
                  onPress={() =>
                    set('currencySpaceBetweenAmountAndSymbol',
                      currencySpaceBetweenAmountAndSymbol === 'true' ? 'false' : 'true')
                  }
                  right={
                    <Switch
                      value={currencySpaceBetweenAmountAndSymbol === 'true'}
                      onValueChange={(v) =>
                        set('currencySpaceBetweenAmountAndSymbol', v ? 'true' : 'false')
                      }
                      trackColor={{ true: colors.primary }}
                    />
                  }
                  showSeparator
                />
                <ListItem
                  title="Custom Symbol"
                  right={
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <TextInput
                        value={defaultCurrencyCustomSymbol}
                        onChangeText={(v) => set('defaultCurrencyCustomSymbol', v)}
                        placeholder={getCurrency(defaultCurrencyCode).symbol}
                        placeholderTextColor={colors.textMuted}
                        style={{
                          color: colors.textPrimary,
                          fontSize: 15,
                          textAlign: 'right',
                          minWidth: 60,
                          padding: 0,
                        }}
                        maxLength={10}
                      />
                    </View>
                  }
                />
              </>
            )}
          </Card>
          {hasCurrency && (
            <Text
              variant="caption"
              color={colors.textMuted}
              style={{ paddingHorizontal: spacing.lg, marginTop: spacing.sm }}
            >
              Custom Symbol overrides the default symbol for display. Leave empty to use the standard symbol.
            </Text>
          )}
        </>
      )}

      {/* Calendar */}
      <SectionHeader title="Calendar" style={{ marginTop: spacing.xl }} />
      <Card>
        <PickerRow
          label="First Day of Week"
          selection={firstDayOfWeekIdx}
          options={DAY_OF_WEEK_OPTIONS}
          onSelectionChange={(v) => set('firstDayOfWeekIdx', v)}
        />
      </Card>

      {/* Manage */}
      <SectionHeader title="Manage" style={{ marginTop: spacing.xl }} />
      <Card>
        <ListItem
          title="Schedules"
          showChevron
          onPress={() => router.push("/(auth)/schedules")}
          showSeparator
        />
        <ListItem
          title="Payees"
          showChevron
          onPress={() => router.push("/(auth)/payees")}
          showSeparator
        />
        <ListItem
          title="Categories"
          showChevron
          onPress={() => router.push("/(auth)/categories")}
        />
      </Card>

      {/* Experimental Features */}
      <SectionHeader title="Experimental Features" style={{ marginTop: spacing.xl }} />
      <Card>
        {ALL_FEATURE_FLAGS.map((flag, index) => (
          <ListItem
            key={flag}
            title={FEATURE_FLAG_LABELS[flag].title}
            subtitle={FEATURE_FLAG_LABELS[flag].subtitle}
            onPress={() => featureFlags.set(flag, !featureFlags[flag])}
            right={
              <Switch
                value={featureFlags[flag]}
                onValueChange={(v) => featureFlags.set(flag, v)}
                trackColor={{ true: colors.primary }}
              />
            }
            showSeparator={index < ALL_FEATURE_FLAGS.length - 1}
          />
        ))}
      </Card>
      <Text
        variant="caption"
        color={colors.textMuted}
        style={{ paddingHorizontal: spacing.lg, marginTop: spacing.sm }}
      >
        Experimental features are incomplete and may cause unexpected behavior or data loss. They are synced across all your devices. Use at your own risk.
      </Text>
    </ScrollView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
    paddingHorizontal: theme.spacing.lg,
  },
});

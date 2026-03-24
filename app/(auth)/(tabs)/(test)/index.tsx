import { Alert, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { Text } from "@/presentation/components/atoms/Text";
import { Button, Text as UIText } from "@/components/ui";

export default function TestScreen() {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.pageBackground }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + spacing.lg,
          paddingHorizontal: spacing.lg,
          paddingBottom: 120,
        }}
      >
        <Text variant="headingLg" color={colors.textPrimary} style={{ marginBottom: spacing.xs }}>
          {"UI Components"}
        </Text>
        <Text variant="caption" color={colors.textMuted} style={{ marginBottom: spacing.xxl }}>
          {"Native SwiftUI on iOS, React Native fallback on Android"}
        </Text>

        <Label>{"Variants"}</Label>
        <Row>
          <Button label="Primary" onPress={() => Alert.alert("Primary")} />
          <Button label="Secondary" variant="secondary" onPress={() => {}} />
          <Button label="Destructive" variant="destructive" onPress={() => {}} />
          <Button label="Plain" variant="plain" onPress={() => {}} />
        </Row>

        <Label>{"Sizes"}</Label>
        <Row height={50}>
          <Button label="Mini" size="mini" onPress={() => {}} />
          <Button label="Small" size="small" onPress={() => {}} />
          <Button label="Regular" onPress={() => {}} />
          <Button label="Large" size="large" onPress={() => {}} />
          <Button label="XL" size="extraLarge" onPress={() => {}} />
        </Row>

        <Label>{"Icons"}</Label>
        <Row>
          <Button label="Add" icon="plus.circle" onPress={() => {}} />
          <Button
            label="Download"
            variant="secondary"
            icon="arrow.down.circle"
            onPress={() => {}}
          />
          <Button label="Delete" variant="destructive" icon="trash" onPress={() => {}} />
        </Row>
        <Button label="Delete" variant="destructive" icon="trash" onPress={() => {}} />

        <Label>{"Glass (iOS 26+)"}</Label>
        <Row>
          <Button label="Glass" variant="glass" icon="sparkles" onPress={() => {}} />
          <Button
            label="Glass Prominent"
            variant="glassProminent"
            icon="star.fill"
            onPress={() => {}}
          />
        </Row>

        <Label>{"Icon Only"}</Label>
        <Row>
          <Button label="Add" icon="plus" iconOnly onPress={() => {}} />
          <Button label="Edit" icon="pencil" variant="secondary" iconOnly onPress={() => {}} />
          <Button label="Delete" icon="trash" variant="destructive" iconOnly onPress={() => {}} />
          <Button label="Settings" icon="gear" variant="plain" iconOnly onPress={() => {}} />
          <Button
            label="Share"
            icon="square.and.arrow.up"
            variant="secondary"
            iconOnly
            onPress={() => {}}
          />
        </Row>

        <Label>{"Roles"}</Label>
        <Row>
          <Button label="Default" variant="secondary" role="default" onPress={() => {}} />
          <Button label="Cancel" variant="secondary" role="cancel" onPress={() => {}} />
          <Button label="Destructive" variant="secondary" role="destructive" onPress={() => {}} />
        </Row>

        <Label>{"Disabled"}</Label>
        <Row>
          <Button label="Primary" disabled onPress={() => {}} />
          <Button label="Secondary" variant="secondary" disabled onPress={() => {}} />
          <Button label="Delete" variant="destructive" disabled onPress={() => {}} />
        </Row>

        {/* ════════════════════════════════════════════════ */}
        {/*  TEXT                                            */}
        {/* ════════════════════════════════════════════════ */}

        <Text
          variant="headingLg"
          color={colors.textPrimary}
          style={{ marginTop: spacing.xxl, marginBottom: spacing.lg }}
        >
          {"Text"}
        </Text>

        <Label>{"Variants"}</Label>
        <UIText variant="displayLg">{"Display Large"}</UIText>
        <UIText variant="headingLg">{"Heading Large"}</UIText>
        <UIText variant="headingSm">{"Heading Small"}</UIText>
        <UIText variant="bodyLg">{"Body Large"}</UIText>
        <UIText variant="body">{"Body"}</UIText>
        <UIText variant="bodySm">{"Body Small"}</UIText>
        <UIText variant="caption">{"Caption"}</UIText>
        <UIText variant="captionSm">{"Caption Small"}</UIText>

        <Label>{"Colors"}</Label>
        <UIText color={colors.primary}>{"Primary"}</UIText>
        <UIText color={colors.vibrantPositive}>{"Vibrant Positive"}</UIText>
        <UIText color={colors.vibrantWarning}>{"Vibrant Warning"}</UIText>
        <UIText color={colors.vibrantNegative}>{"Vibrant Negative"}</UIText>
        <UIText color={colors.textMuted}>{"Muted"}</UIText>

        <Label>{"Styles"}</Label>
        <UIText bold>{"Bold text"}</UIText>
        <UIText italic>{"Italic text"}</UIText>
        <UIText tabularNums>{"1,234,567.89"}</UIText>
        <UIText textCase="uppercase">{"uppercase text"}</UIText>

        <Label>{"MinScale (shrinks to fit)"}</Label>
        <Row>
          <UIText minScale={0.5} numberOfLines={1}>
            {"AED 9,999,999.99 — this text shrinks"}
          </UIText>
        </Row>
        <Row>
          <UIText numberOfLines={1}>{"AED 9,999,999.99 — this text truncates"}</UIText>
        </Row>

        <Label>{"Alignment"}</Label>
        <UIText align="left">{"Left aligned"}</UIText>
        <UIText align="center">{"Center aligned"}</UIText>
        <UIText align="right">{"Right aligned"}</UIText>
      </ScrollView>
    </View>
  );
}

function Label({ children }: { children: string }) {
  const { colors, spacing } = useTheme();
  return (
    <Text
      variant="captionSm"
      color={colors.textMuted}
      style={{
        textTransform: "uppercase",
        letterSpacing: 1,
        marginTop: spacing.md,
        marginBottom: spacing.sm,
      }}
    >
      {children}
    </Text>
  );
}

function Row({ children, height = 36 }: { children: React.ReactNode; height?: number }) {
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 8,
        marginBottom: 8,
        minHeight: height,
      }}
    >
      {children}
    </View>
  );
}

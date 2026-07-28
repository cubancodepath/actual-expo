import { Component, type ReactNode } from "react";
import { ScrollView, View, Pressable, StyleSheet, Appearance } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RotateCw, TriangleAlert } from "lucide-react-native";
import i18n from "@/i18n/config";
import { emitErrorEvent } from "@/lib/errors/ErrorChannel";

// Use raw RN Text to avoid circular deps with themed components
import { Text as RNText } from "react-native";

/**
 * Self-contained palette, mirroring the app's tokens by hand.
 *
 * This boundary renders when the tree below it has already failed, and it sits
 * above every provider — so it deliberately depends on nothing but React Native.
 * Reading theme variables here would couple the last-resort screen to the very
 * system that may be what broke.
 */
const PALETTE = {
  light: {
    background: "#F7F7F8",
    surface: "#FFFFFF",
    border: "#E5E5E7",
    text: "#1E1E20",
    muted: "#78787E",
    danger: "#E5484D",
    dangerSoft: "#FDECED",
    accent: "#6E56CF",
  },
  dark: {
    background: "#1A1A1C",
    surface: "#2C2C30",
    border: "#3A3A3E",
    text: "#FCFCFC",
    muted: "#A0A0A8",
    danger: "#F16A6F",
    dangerSoft: "#3A2224",
    accent: "#8B75E8",
  },
} as const;

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
    // This component IS the display (its own full-screen fallback below);
    // the bus event is for logging only.
    emitErrorEvent(error, { componentStack: info.componentStack });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const colors = PALETTE[Appearance.getColorScheme() === "dark" ? "dark" : "light"];

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.content} bounces={false}>
          <View style={[styles.iconCircle, { backgroundColor: colors.dangerSoft }]}>
            <TriangleAlert size={32} color={colors.danger} />
          </View>

          <View style={styles.textBlock}>
            <View>
              <RNText style={[styles.title, { color: colors.text }]}>
                {i18n.t("errors:fatalTitle")}
              </RNText>
            </View>
            <View>
              <RNText style={[styles.message, { color: colors.muted }]}>
                {i18n.t("errors:fatalBody")}
              </RNText>
            </View>
          </View>

          {__DEV__ && this.state.error && (
            <View
              style={[
                styles.errorBox,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <RNText style={[styles.errorText, { color: colors.danger }]} numberOfLines={6}>
                {this.state.error.message}
              </RNText>
            </View>
          )}

          <Pressable
            onPress={this.handleReset}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.accent },
              pressed && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={i18n.t("errors:restart")}
          >
            <RotateCw size={18} color="#fff" />
            <RNText style={styles.buttonText}>{i18n.t("errors:restart")}</RNText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    gap: 24,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  textBlock: {
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  message: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  errorBox: {
    width: "100%",
    borderRadius: 12,
    borderWidth: 0.5,
    padding: 16,
  },
  errorText: {
    fontSize: 13,
    fontFamily: "Menlo",
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 9999,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});

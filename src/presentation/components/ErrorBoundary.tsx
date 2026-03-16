import { Component, type ReactNode } from "react";
import { ScrollView, View, StyleSheet, Appearance } from "react-native";
import * as Sentry from "@sentry/react-native";
import { Ionicons } from "@expo/vector-icons";
import { lightColors, darkColors } from "../../theme/colors";

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
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const isDark = Appearance.getColorScheme() === "dark";
    const colors = isDark ? darkColors : lightColors;

    return (
      <View style={[styles.container, { backgroundColor: colors.pageBackground }]}>
        <ScrollView contentContainerStyle={styles.content} bounces={false}>
          <View style={[styles.iconCircle, { backgroundColor: colors.errorBackground }]}>
            <Ionicons name="warning-outline" size={32} color={colors.errorText} />
          </View>

          <View style={styles.textBlock}>
            <View>
              {/* Using raw RN Text to avoid dependency on themed components */}
              <RNText style={[styles.title, { color: colors.textPrimary }]}>
                Something went wrong
              </RNText>
            </View>
            <View>
              <RNText style={[styles.message, { color: colors.textSecondary }]}>
                The app ran into an unexpected error. You can try again or restart the app.
              </RNText>
            </View>
          </View>

          {this.state.error && (
            <View
              style={[
                styles.errorBox,
                { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
              ]}
            >
              <RNText style={[styles.errorText, { color: colors.negative }]} numberOfLines={6}>
                {this.state.error.message}
              </RNText>
            </View>
          )}

          <View
            style={[styles.button, { backgroundColor: colors.primary }]}
            onTouchEnd={this.handleReset}
          >
            <Ionicons name="refresh" size={18} color="#fff" />
            <RNText style={styles.buttonText}>Try Again</RNText>
          </View>
        </ScrollView>
      </View>
    );
  }
}

// Use raw RN Text to avoid circular deps with themed components
import { Text as RNText } from "react-native";

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

import { Component, type ReactNode } from "react";
import { View } from "react-native";
import { Typography } from "heroui-native";
import i18n from "@/i18n/config";
import { emitErrorEvent } from "@/lib/errors/ErrorChannel";

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

/**
 * Per-widget boundary — mirrors upstream's per-card `ErrorBoundary` so one
 * failing report can't blank the whole dashboard. Renders a compact inline
 * fallback inside the card's slot.
 */
export class CardErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    emitErrorEvent(error, { operation: "reportWidget" });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View className="flex-1 items-center justify-center p-4">
        <Typography className="text-center text-sm text-muted">
          {i18n.t("widgetFailed", { ns: "reports" })}
        </Typography>
      </View>
    );
  }
}

import { View } from "react-native";
import { spacing as spacingTokens } from "../../../theme";

type SpacingKey = keyof typeof spacingTokens;

export interface SpacerProps {
  size?: SpacingKey;
  horizontal?: boolean;
}

export function Spacer({ size = "md", horizontal = false }: SpacerProps) {
  const value = spacingTokens[size];

  return <View style={horizontal ? { width: value } : { height: value }} />;
}

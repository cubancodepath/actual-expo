import { requireNativeView } from "expo";
import * as React from "react";

import { ActualUiViewProps } from "./ActualUi.types";

const NativeView: React.ComponentType<ActualUiViewProps> = requireNativeView("ActualUi");

export default function ActualUiView(props: ActualUiViewProps) {
  return <NativeView {...props} />;
}

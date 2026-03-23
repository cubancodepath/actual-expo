import * as React from "react";

import { ActualUiViewProps } from "./ActualUi.types";

export default function ActualUiView(props: ActualUiViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}

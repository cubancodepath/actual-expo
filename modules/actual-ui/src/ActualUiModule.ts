import { NativeModule, requireNativeModule } from "expo";

import { ActualUiModuleEvents } from "./ActualUi.types";

declare class ActualUiModule extends NativeModule<ActualUiModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<ActualUiModule>("ActualUi");

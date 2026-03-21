import { registerWebModule, NativeModule } from "expo";

import { ChangeEventPayload } from "./ActualUi.types";

type ActualUiModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
};

class ActualUiModule extends NativeModule<ActualUiModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit("onChange", { value });
  }
  hello() {
    return "Hello world! 👋";
  }
}

export default registerWebModule(ActualUiModule, "ActualUiModule");

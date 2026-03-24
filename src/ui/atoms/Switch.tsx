import { Switch as HeroSwitch } from "heroui-native";
import type { ComponentProps } from "react";

type SwitchProps = ComponentProps<typeof HeroSwitch>;

export function Switch(props: SwitchProps) {
  return <HeroSwitch {...props} />;
}

Switch.Thumb = HeroSwitch.Thumb;
Switch.StartContent = HeroSwitch.StartContent;
Switch.EndContent = HeroSwitch.EndContent;

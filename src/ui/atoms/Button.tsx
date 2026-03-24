import { Button as HeroButton } from "heroui-native";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type ButtonProps = ComponentProps<typeof HeroButton>;

export function Button({ className, ...props }: ButtonProps) {
  return <HeroButton className={cn("rounded-lg", className)} {...props} />;
}

Button.Label = HeroButton.Label;

import { Chip as HeroChip } from "heroui-native";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type ChipProps = Omit<ComponentProps<typeof HeroChip>, "children"> & {
  children: ReactNode;
};

export function Chip({ className, children, ...props }: ChipProps) {
  return (
    <HeroChip className={cn("rounded-sm bg-accent", className)} {...props}>
      {children}
    </HeroChip>
  );
}

function ChipLabel({ className, ...props }: ComponentProps<typeof HeroChip.Label>) {
  return <HeroChip.Label className={cn("text-white", className)} {...props} />;
}

Chip.Label = ChipLabel;

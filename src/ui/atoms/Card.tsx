import { Card as HeroCard } from "heroui-native";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type CardProps = ComponentProps<typeof HeroCard>;

export function Card({ className, ...props }: CardProps) {
  return <HeroCard className={cn("rounded-xl", className)} {...props} />;
}

Card.Header = HeroCard.Header;
Card.Body = HeroCard.Body;
Card.Footer = HeroCard.Footer;
Card.Title = HeroCard.Title;
Card.Description = HeroCard.Description;

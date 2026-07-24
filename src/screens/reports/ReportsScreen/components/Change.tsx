import { Money } from "@/ui/Money";

/**
 * A ± change amount (upstream `Change`): green when positive, red when negative,
 * balanced hue at zero, with a leading sign. Privacy-aware via {@link Money}.
 */
export function Change({ amount }: { amount: number }) {
  const color = amount === 0 ? "text-balanced" : amount < 0 ? "text-danger" : "text-positive";
  return <Money cents={amount} tone="plain" showSign className={`text-sm font-medium ${color}`} />;
}

import { useMemo, useState, type ReactNode, type Ref } from "react";
import { ScrollView, View, type ScrollViewProps } from "react-native";
import { Typography } from "heroui-native";
import { CloseButton } from "@/ui/CloseButton";
import { Money } from "@/ui/Money";
import { AmountSheetContext, TINT, useAmountSheetContext, type AmountSheetStatus } from "./context";

/** How far the body's cards overlap the backdrop's curved bottom at rest. */
const CARD_OVERLAP = 36;
/** Height of the backdrop's curved zone, fully below the hero's straight edge. */
const HERO_CURVE = 56;

const heroRadii = { borderBottomLeftRadius: 56, borderBottomRightRadius: 56 };

/**
 * Provider for a tinted "sandwich" screen: a curved backdrop, a scrolling body
 * whose cards tuck into that curve, and a hero carrying a title and a big
 * amount. Renders no view of its own — the parts position themselves against
 * the route's own container, and each carries its own z-index, so the order
 * they appear in is irrelevant.
 *
 * ```tsx
 * <AmountSheet status={remaining > 0 ? "danger" : "success"} fallbackHeight={180}>
 *   <AmountSheet.Backdrop />
 *   <AmountSheet.Body ref={scrollRef} {...scrollProps}
 *     contentContainerStyle={{ paddingBottom }}>…cards…</AmountSheet.Body>
 *   <AmountSheet.Hero>
 *     <AmountSheet.Title>{name}</AmountSheet.Title>
 *     <AmountSheet.Amount cents={remaining} />
 *   </AmountSheet.Hero>
 *   <AmountSheet.Close onPress={() => router.back()} />
 * </AmountSheet>
 * ```
 */
export function AmountSheetRoot({
  status,
  fallbackHeight,
  children,
}: {
  /** Drives the tint of the backdrop and the hero. */
  status: AmountSheetStatus;
  /**
   * Hero height assumed for the first frame, before it measures itself. Required
   * because it depends on what you put in the hero, and a bad guess shows as a
   * one-frame layout jump — there is no default worth taking.
   */
  fallbackHeight: number;
  children: ReactNode;
}) {
  const [heroHeight, setHeroHeight] = useState(fallbackHeight);

  const value = useMemo(
    () => ({ tint: TINT[status], heroHeight, setHeroHeight }),
    [status, heroHeight],
  );

  return <AmountSheetContext value={value}>{children}</AmountSheetContext>;
}

/**
 * The curved slab the body's cards rest on. Sits behind the (transparent) body;
 * only its bottom curve peeks out under them. The curve zone lives entirely
 * BELOW the hero's straight edge, so the hero's square corners rest on the
 * still-straight part of the backdrop — an invisible seam — while the curve and
 * the card overlap stay visible. Opaque composite: solid background + tint.
 */
export function AmountSheetBackdrop() {
  const { tint, heroHeight } = useAmountSheetContext();

  return (
    <View className="absolute inset-x-0 top-0 z-0" style={{ height: heroHeight + HERO_CURVE }}>
      <View className="absolute inset-0 bg-background" style={heroRadii} />
      <View className={`absolute inset-0 ${tint}`} style={heroRadii} />
    </View>
  );
}

type AmountSheetBodyProps = ScrollViewProps & { ref?: Ref<ScrollView> };

/**
 * The scrolling content. Must be the screen's root-level scroll: inside a
 * formSheet a plain `flex-1` View root does not paint its scroll content.
 * Transparent, so the backdrop shows through. Reserves top padding so the cards
 * start inside the backdrop's curve zone (overlapping it) and slide BEHIND the
 * hero as they scroll — the sandwich. Extra `contentContainerStyle` is merged
 * on top, so callers keep their own bottom padding.
 */
export function AmountSheetBody({
  ref,
  children,
  style,
  contentContainerStyle,
  ...rest
}: AmountSheetBodyProps) {
  const { heroHeight } = useAmountSheetContext();

  return (
    <ScrollView
      ref={ref}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      {...rest}
      className="z-[1] flex-1"
      style={style}
      contentContainerStyle={[
        { paddingTop: heroHeight + HERO_CURVE - CARD_OVERLAP },
        contentContainerStyle,
      ]}
    >
      {children}
    </ScrollView>
  );
}

/**
 * The front layer: same tint as the backdrop but with a square bottom edge and
 * opaque, so scrolled cards vanish behind it. Ends CARD_OVERLAP above the
 * backdrop's curve, leaving the "slot" the cards slide into. Measures itself and
 * publishes its height — that's what the other two layers lay out against.
 * `children` are stacked in a centred column, in the order given.
 */
export function AmountSheetHero({ children }: { children: ReactNode }) {
  const { tint, setHeroHeight } = useAmountSheetContext();

  return (
    <View
      className="absolute inset-x-0 top-0 z-10 overflow-hidden"
      onLayout={(e) => setHeroHeight(e.nativeEvent.layout.height)}
    >
      <View className="absolute inset-0 bg-background" />
      <View className={`absolute inset-0 ${tint}`} />
      <View className="items-center gap-1 px-6 pt-18 pb-4">{children}</View>
    </View>
  );
}

/** The hero's heading, above the amount. */
export function AmountSheetTitle({ children }: { children: ReactNode }) {
  return (
    <Typography className="text-base font-semibold text-foreground" numberOfLines={1}>
      {children}
    </Typography>
  );
}

/** The hero's headline figure. */
export function AmountSheetAmount({ cents }: { cents: number }) {
  return (
    <Money cents={cents} tone="plain" mask={false} className="text-3xl font-bold text-foreground" />
  );
}

/**
 * Floating dismiss control, pinned to the sheet's top-left corner above every
 * layer. It's a root-level part rather than a hero child on purpose: the hero's
 * column is padded, and Yoga lays absolute children out against their parent's
 * content box, which would push the button off the corner.
 *
 * Renders a {@link CloseButton} by default; pass `children` to swap in another
 * control and keep only the positioning.
 */
export function AmountSheetClose({
  onPress,
  children,
}: {
  /** Ignored when `children` is given — wire the handler on your own control. */
  onPress?: () => void;
  children?: ReactNode;
}) {
  return (
    <View className="absolute left-4 top-4 z-20">
      {children ?? <CloseButton onPress={onPress} />}
    </View>
  );
}

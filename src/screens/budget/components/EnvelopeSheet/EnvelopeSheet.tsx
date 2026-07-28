import { useCallback, useEffect, useMemo, useState, type ReactNode, type Ref } from "react";
import { ScrollView, View, type ScrollViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Typography } from "heroui-native";
import { CloseButton } from "@/ui/CloseButton";
import { Money } from "@/ui/Money";
import { useSurfaceLevel } from "@/ui/surface-level";
import {
  EnvelopeSheetContext,
  TINT,
  useEnvelopeSheetContext,
  useEnvelopeSheetReady,
  type EnvelopeSheetPresentation,
  type EnvelopeSheetTone,
} from "./context";

/** How far the pinned/scrolling cards overlap the backdrop's curved bottom. */
const CARD_OVERLAP = 36;
/** Height of the backdrop's curved zone, fully below the hero's straight edge. */
const HERO_CURVE = 56;

const heroRadii = { borderBottomLeftRadius: 56, borderBottomRightRadius: 56 };

/*
 * Stacking order, in one place so it can be read as a whole. The classes stay
 * static literals because Uniwind can't resolve constructed ones.
 *
 *   body      z-1         transparent, scrolls
 *   backdrop  z-0 | z-10  behind the body, or over it when a Pinned part exists
 *   hero      z-10        opaque, holds the title + amount
 *   pinned    z-15        the card that stays in the curve
 *   close     z-20        always reachable
 *   actions   z-20        top-right corner, opposite close
 *   fab       z-20        the primary action, over the body
 *
 * Anything a screen positions over the body MUST come from a part in this list.
 * The body is a full-height ScrollView with a z of its own, so a bare
 * `absolute` sibling lands below it: painted, but never touchable.
 */

/**
 * Provider for a tinted "envelope" screen: a curved backdrop, a scrolling body,
 * a hero carrying a title and a big amount, and optionally a card pinned in the
 * curve. Renders no view of its own — the parts position themselves against the
 * route's own container and carry their own z-index, so the order they appear in
 * is irrelevant.
 *
 * The parts coordinate through context rather than through matching props on the
 * caller: mounting a `Pinned` part is enough to make the `Backdrop` cover the
 * body and the `Body` clear the card, and `presentation` is the single answer to
 * every safe-area question. Nothing here needs a height guess — see
 * {@link useEnvelopeSheetReady}.
 *
 * ```tsx
 * <EnvelopeSheet tone={remaining > 0 ? "danger" : "success"}>
 *   <EnvelopeSheet.Backdrop />
 *   <EnvelopeSheet.Body ref={scrollRef} {...scrollProps}
 *     contentContainerStyle={{ paddingBottom }}>…cards…</EnvelopeSheet.Body>
 *   <EnvelopeSheet.Hero>
 *     <EnvelopeSheet.Title>{name}</EnvelopeSheet.Title>
 *     <EnvelopeSheet.Amount cents={remaining} />
 *   </EnvelopeSheet.Hero>
 *   <EnvelopeSheet.Close onPress={() => router.back()} />
 * </EnvelopeSheet>
 * ```
 */
export function EnvelopeSheetRoot({
  tone,
  presentation = "sheet",
  children,
}: {
  /** Drives the tint of the backdrop and the hero. */
  tone: EnvelopeSheetTone;
  /**
   * `"sheet"` (default) for a form sheet, which the system already places below
   * the notch. `"push"` for a pushed card, which starts at the very top of the
   * window and so needs the parts to pay the safe-area inset themselves.
   */
  presentation?: EnvelopeSheetPresentation;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  // Deliberately NOT derived from the `presentation` prop above: that prop is
  // about layout (safe-area inset), while the canvas is about elevation. A
  // pushed EnvelopeSheet on a regular route is a screen; a formSheet one is a
  // sheet — and only the caller's <SurfaceLevel> knows which.
  const { canvas } = useSurfaceLevel();
  const [heroHeight, setHeroHeight] = useState<number | null>(null);
  const [pinnedHeight, setPinnedHeight] = useState<number | null>(null);
  const [hasPinned, setHasPinned] = useState(false);

  const registerPinned = useCallback(() => {
    setHasPinned(true);
    return () => {
      setHasPinned(false);
      setPinnedHeight(null);
    };
  }, []);

  const value = useMemo(
    () => ({
      tint: TINT[tone],
      presentation,
      topInset: presentation === "push" ? insets.top : 0,
      heroHeight,
      setHeroHeight,
      // No pinned part means nothing to wait for and nothing to clear.
      pinnedHeight: hasPinned ? pinnedHeight : 0,
      setPinnedHeight,
      hasPinned,
      registerPinned,
    }),
    [tone, presentation, insets.top, heroHeight, pinnedHeight, hasPinned, registerPinned],
  );

  return (
    <EnvelopeSheetContext value={value}>
      <View className={`flex-1 ${canvas}`}>{children}</View>
    </EnvelopeSheetContext>
  );
}

/**
 * The curved slab under the hero. The curve zone lives entirely BELOW the hero's
 * straight edge, so the hero's square corners rest on the still-straight part of
 * the backdrop — an invisible seam — while the curve stays visible. Opaque
 * composite: solid background + tint.
 *
 * Which side of the body it paints on follows from whether the sheet has a
 * {@link EnvelopeSheetPinned} part, because those are the two halves of one
 * decision:
 *
 * - No pinned part → behind the body, so the body's cards rest ON the curve and
 *   tuck into it as they scroll.
 * - Pinned part → over the body, because the pinned card already owns that slot;
 *   scrolled rows must vanish under the whole tinted area instead of riding up
 *   into the curve beside the card.
 */
export function EnvelopeSheetBackdrop() {
  const { tint, heroHeight, hasPinned } = useEnvelopeSheetContext();
  const ready = useEnvelopeSheetReady();
  // The opaque base UNDER the tint: it must equal the sheet root's canvas
  // exactly, or a seam shows where the hero's square edge meets the backdrop.
  const { canvas } = useSurfaceLevel();

  return (
    <View
      className={hasPinned ? "absolute inset-x-0 top-0 z-10" : "absolute inset-x-0 top-0 z-0"}
      style={{ height: (heroHeight ?? 0) + HERO_CURVE, opacity: ready ? 1 : 0 }}
    >
      <View className={`absolute inset-0 ${canvas}`} style={heroRadii} />
      <View className={`absolute inset-0 ${tint}`} style={heroRadii} />
    </View>
  );
}

type EnvelopeSheetBodyProps = ScrollViewProps & { ref?: Ref<ScrollView> };

/**
 * The scrolling content. Must be the screen's root-level scroll: inside a
 * formSheet a plain `flex-1` View root does not paint its scroll content.
 * Transparent, so the backdrop shows through. Reserves top padding so the cards
 * start inside the backdrop's curve zone (overlapping it) and slide BEHIND the
 * hero as they scroll. With a {@link EnvelopeSheetPinned} part the padding also
 * clears the card, so the content starts below it instead of under it. Extra
 * `contentContainerStyle` is merged on top, so callers keep their own bottom
 * padding.
 */
export function EnvelopeSheetBody({
  ref,
  children,
  style,
  contentContainerStyle,
  ...rest
}: EnvelopeSheetBodyProps) {
  const { heroHeight, pinnedHeight } = useEnvelopeSheetContext();
  const ready = useEnvelopeSheetReady();

  return (
    <ScrollView
      ref={ref}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      {...rest}
      className="z-1 flex-1"
      style={[{ opacity: ready ? 1 : 0 }, style]}
      contentContainerStyle={[
        {
          paddingTop: (heroHeight ?? 0) + HERO_CURVE - CARD_OVERLAP + (pinnedHeight ?? 0),
        },
        contentContainerStyle,
      ]}
    >
      {children}
    </ScrollView>
  );
}

/**
 * A card that sits in the backdrop's curve and STAYS there — the same slot the
 * body's first card would occupy, but outside the scroll, so the list underneath
 * moves against it instead of carrying it away. Sits above every other layer bar
 * the close button, so scrolled rows pass behind it; give it an opaque child (a
 * `ListGroup`, a `Surface`) or they'll show through.
 *
 * Mounting one is the whole opt-in: it measures itself so `Body` can clear it,
 * and it tells `Backdrop` to cover the body rather than sit behind it.
 *
 * Optional — sheets whose whole content scrolls just don't render one.
 */
export function EnvelopeSheetPinned({ children }: { children: ReactNode }) {
  const { heroHeight, setPinnedHeight, registerPinned } = useEnvelopeSheetContext();
  const ready = useEnvelopeSheetReady();

  useEffect(() => registerPinned(), [registerPinned]);

  return (
    <View
      className="absolute inset-x-0 z-15"
      style={{
        top: (heroHeight ?? 0) + HERO_CURVE - CARD_OVERLAP,
        opacity: ready ? 1 : 0,
      }}
      onLayout={(e) => setPinnedHeight(e.nativeEvent.layout.height)}
    >
      {children}
    </View>
  );
}

/**
 * The front layer: same tint as the backdrop but with a square bottom edge and
 * opaque, so scrolled cards vanish behind it. Ends CARD_OVERLAP above the
 * backdrop's curve, leaving the "slot" the cards slide into. Measures itself and
 * publishes its height — that's what the other layers lay out against.
 * `children` are stacked in a centred column, in the order given.
 */
export function EnvelopeSheetHero({ children }: { children: ReactNode }) {
  const { tint, topInset, setHeroHeight } = useEnvelopeSheetContext();
  const ready = useEnvelopeSheetReady();
  // Same base as the backdrop — see EnvelopeSheetBackdrop.
  const { canvas } = useSurfaceLevel();

  return (
    <View
      className="absolute inset-x-0 top-0 z-10 overflow-hidden"
      style={{ opacity: ready ? 1 : 0 }}
      onLayout={(e) => setHeroHeight(e.nativeEvent.layout.height)}
    >
      <View className={`absolute inset-0 ${canvas}`} />
      <View className={`absolute inset-0 ${tint}`} />
      {/* `pt-18` is the form-sheet figure; a pushed sheet swaps in its own inset. */}
      <View
        className="items-center gap-1 px-6 pt-18 pb-4"
        style={topInset > 0 ? { paddingTop: topInset + 12 } : undefined}
      >
        {children}
      </View>
    </View>
  );
}

/** The hero's heading, above the amount. */
export function EnvelopeSheetTitle({ children }: { children: ReactNode }) {
  return (
    <Typography className="text-base font-semibold text-foreground" numberOfLines={1}>
      {children}
    </Typography>
  );
}

/** The hero's headline figure. */
export function EnvelopeSheetAmount({ cents }: { cents: number }) {
  return (
    <Money cents={cents} tone="plain" mask={false} className="text-3xl font-bold text-foreground" />
  );
}

/**
 * A line of small print qualifying the figure — where it comes from, what it
 * covers.
 *
 * Faded `foreground` rather than `muted`: the hero is painted with the sheet's
 * tint, and muted is a grey picked to sit on the plain background, so on top of
 * a tint it drops to barely legible. Same ink as the title, just lighter.
 */
export function EnvelopeSheetCaption({ children }: { children: ReactNode }) {
  return (
    <Typography className="text-xs text-foreground/70" numberOfLines={1}>
      {children}
    </Typography>
  );
}

/**
 * Shared positioning for the two floating corner controls. They're root-level
 * parts rather than hero children on purpose: the hero's column is padded, and
 * Yoga lays absolute children out against their parent's content box, which
 * would push them off the corner.
 */
function useCornerStyle() {
  const { topInset } = useEnvelopeSheetContext();
  const ready = useEnvelopeSheetReady();

  return {
    opacity: ready ? 1 : 0,
    ...(topInset > 0 ? { top: topInset + 4 } : null),
  };
}

/**
 * Floating dismiss control, pinned to the sheet's top-LEFT corner above every
 * layer. Renders a {@link CloseButton} by default; pass `children` to swap in
 * another control (a back chevron, say) and keep only the positioning.
 */
export function EnvelopeSheetClose({
  onPress,
  children,
}: {
  /** Ignored when `children` is given — wire the handler on your own control. */
  onPress?: () => void;
  children?: ReactNode;
}) {
  return (
    <View className="absolute left-4 top-4 z-20" style={useCornerStyle()}>
      {children ?? <CloseButton onPress={onPress} />}
    </View>
  );
}

/**
 * The top-RIGHT counterpart to {@link EnvelopeSheetClose} — an overflow menu or
 * whatever else the screen needs opposite the dismiss control. Bring your own
 * control; this part only owns the corner.
 */
export function EnvelopeSheetActions({ children }: { children: ReactNode }) {
  return (
    <View className="absolute right-4 top-4 z-20" style={useCornerStyle()}>
      {children}
    </View>
  );
}

/**
 * Bottom-right corner: the sheet's primary action. Like {@link EnvelopeSheetClose}
 * and {@link EnvelopeSheetActions} it owns only the position and the layer —
 * bring your own control.
 *
 * The layer is the point. {@link EnvelopeSheetBody} is a full-height ScrollView
 * carrying its own z, so a screen that positions a button here by hand gets one
 * that is painted but never touchable — the scroll swallows the tap.
 *
 * No `useCornerStyle()`: that pays the safe-area inset the TOP corners need on a
 * pushed sheet, and the bottom has no equivalent.
 */
export function EnvelopeSheetFab({ children }: { children: ReactNode }) {
  return <View className="absolute bottom-8 right-5 z-20">{children}</View>;
}

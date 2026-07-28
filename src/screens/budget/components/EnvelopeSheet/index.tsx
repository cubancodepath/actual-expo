import {
  EnvelopeSheetActions,
  EnvelopeSheetAmount,
  EnvelopeSheetBackdrop,
  EnvelopeSheetBody,
  EnvelopeSheetCaption,
  EnvelopeSheetClose,
  EnvelopeSheetFab,
  EnvelopeSheetHero,
  EnvelopeSheetPinned,
  EnvelopeSheetRoot,
  EnvelopeSheetTitle,
} from "./EnvelopeSheet";

export const EnvelopeSheet = Object.assign(EnvelopeSheetRoot, {
  /** The curved slab; behind the body, or over it when there's a pinned card. */
  Backdrop: EnvelopeSheetBackdrop,
  /** Root-level scrolling content, tucked under the hero. */
  Body: EnvelopeSheetBody,
  /** A card fixed in the backdrop's curve; the body scrolls behind it. */
  Pinned: EnvelopeSheetPinned,
  /** The measured front layer holding the title, the amount and anything else. */
  Hero: EnvelopeSheetHero,
  Title: EnvelopeSheetTitle,
  Amount: EnvelopeSheetAmount,
  /** Small print under the figure, legible on the hero's tint. */
  Caption: EnvelopeSheetCaption,
  /** Floating dismiss control (top-left); pass children to swap the default button. */
  Close: EnvelopeSheetClose,
  /** Top-right corner, opposite Close — an overflow menu, typically. */
  Actions: EnvelopeSheetActions,
  /** Bottom-right corner: the primary action, on a layer above the body. */
  Fab: EnvelopeSheetFab,
});

export type { EnvelopeSheetPresentation, EnvelopeSheetTone } from "./context";

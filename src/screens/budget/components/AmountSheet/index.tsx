import {
  AmountSheetAmount,
  AmountSheetBackdrop,
  AmountSheetBody,
  AmountSheetClose,
  AmountSheetHero,
  AmountSheetRoot,
  AmountSheetTitle,
} from "./AmountSheet";

export const AmountSheet = Object.assign(AmountSheetRoot, {
  /** The curved slab behind everything; the body's cards rest on its curve. */
  Backdrop: AmountSheetBackdrop,
  /** Root-level scrolling content, tucked under the hero. */
  Body: AmountSheetBody,
  /** The measured front layer holding the title, the amount and anything else. */
  Hero: AmountSheetHero,
  Title: AmountSheetTitle,
  Amount: AmountSheetAmount,
  /** Floating dismiss control; pass children to swap the default button. */
  Close: AmountSheetClose,
});

export type { AmountSheetStatus } from "./context";

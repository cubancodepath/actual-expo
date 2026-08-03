import {
  ScreenHeaderActions,
  ScreenHeaderBack,
  ScreenHeaderRoot,
  ScreenHeaderTitle,
} from "./ScreenHeader";
import { ScreenHeaderBody, ScreenHeaderFloating, ScreenHeaderScrollArea } from "./ScrollArea";

export const ScreenHeader = Object.assign(ScreenHeaderRoot, {
  Back: ScreenHeaderBack,
  Title: ScreenHeaderTitle,
  Actions: ScreenHeaderActions,
  /** Provider + full-height container for a scroll-aware (blur) header. */
  ScrollArea: ScreenHeaderScrollArea,
  /** Scrolling content that lives under a `ScreenHeader.Floating`. */
  Body: ScreenHeaderBody,
  /** Fixed header overlay whose blur ramps up on scroll. */
  Floating: ScreenHeaderFloating,
});

export { useScreenHeaderScroll, useScreenHeaderAnimatedScroll } from "./context";

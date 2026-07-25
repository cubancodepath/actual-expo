import { Platform } from "react-native";
import { FullWindowOverlay } from "react-native-screens";
import { LoadingOverlay } from "@/ui/LoadingOverlay";
import { useBusyStore } from "./busyStore";

/**
 * Sole subscriber of the busy store, and the app's ONLY blocking overlay.
 * Mounted once at the app root as a sibling above the navigator, so it survives
 * screens unmounting mid-operation (e.g. the file picker during a budget
 * switch). The spinner is Reanimated-driven (UI thread), so it keeps animating
 * even while the JS thread is blocked in synchronous core work.
 *
 * On iOS the content goes in a `FullWindowOverlay` (same trick as
 * AmountKeyboard): it renders in a separate UIWindow ABOVE native presentations,
 * so it covers `fullScreenModal`/`formSheet` screens too. Without it, a plain
 * root view sits under those presentations, which is why screens inside modals
 * used to ship their own duplicate overlay — two blurs, two messages, stacked.
 * Not a native Modal, so it never competes with sheets mounting/unmounting
 * underneath (the stuck-modal hazard LoadingOverlay documents).
 *
 * `FullWindowOverlay` is iOS-only (the same split AmountKeyboard already lives
 * with), so Android uses the native-Modal variant instead: a root view there
 * can't cover a native screen presentation either, and now that this is the
 * app's only overlay there is no second Modal left to conflict with.
 *
 * Mounted only while busy, so an idle overlay window can never swallow touches.
 */
export function BusyOverlayHost() {
  const count = useBusyStore((s) => s.count);
  const message = useBusyStore((s) => s.message);

  if (count === 0) return null;

  const isIOS = Platform.OS === "ios";
  const overlay = <LoadingOverlay asModal={!isIOS} visible message={message ?? undefined} />;

  return isIOS ? <FullWindowOverlay>{overlay}</FullWindowOverlay> : overlay;
}

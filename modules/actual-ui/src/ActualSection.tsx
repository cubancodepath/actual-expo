import { requireNativeView } from "expo";
import type { CommonViewModifierProps } from "@expo/ui/swift-ui";
import { createViewModifierEventListener } from "@expo/ui/swift-ui/modifiers";

// ---------------------------------------------------------------------------
// Child marker views
// ---------------------------------------------------------------------------

const NativeActualSectionHeader: React.ComponentType<{ children: React.ReactNode }> =
  requireNativeView("ActualUi", "ActualSectionHeaderView");

const NativeActualSectionContent: React.ComponentType<{ children: React.ReactNode }> =
  requireNativeView("ActualUi", "ActualSectionContentView");

// ---------------------------------------------------------------------------
// ActualSection
// ---------------------------------------------------------------------------

export interface ActualSectionProps extends CommonViewModifierProps {
  /** Controlled expand/collapse state */
  isExpanded?: boolean;
  /** Callback when expand/collapse changes */
  onIsExpandedChange?: (isExpanded: boolean) => void;
  /** Header content (rendered after the chevron) */
  header?: React.ReactNode;
  /** Header background color hex (for sticky header) */
  headerBackground?: string;
  /** Section content rows */
  children: React.ReactNode;
}

interface NativeActualSectionProps extends CommonViewModifierProps {
  isExpanded?: boolean;
  headerBackground?: string;
  onIsExpandedChange?: (event: { nativeEvent: { isExpanded: boolean } }) => void;
  children: React.ReactNode;
}

const NativeActualSection: React.ComponentType<NativeActualSectionProps> = requireNativeView(
  "ActualUi",
  "ActualSectionView",
);

export function ActualSection({
  isExpanded,
  onIsExpandedChange,
  header,
  headerBackground,
  children,
  modifiers,
  ...restProps
}: ActualSectionProps) {
  return (
    <NativeActualSection
      isExpanded={isExpanded}
      headerBackground={headerBackground}
      onIsExpandedChange={
        onIsExpandedChange ? (e) => onIsExpandedChange(e.nativeEvent.isExpanded) : undefined
      }
      modifiers={modifiers}
      {...(modifiers ? createViewModifierEventListener(modifiers) : undefined)}
      {...restProps}
    >
      <NativeActualSectionHeader>{header}</NativeActualSectionHeader>
      <NativeActualSectionContent>{children}</NativeActualSectionContent>
    </NativeActualSection>
  );
}

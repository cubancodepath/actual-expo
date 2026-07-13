import { type ReactNode } from "react";
import { View } from "react-native";
import { SearchField } from "heroui-native";
import { ScreenHeader } from "@/ui/ScreenHeader";

type PickerScreenProps = {
  title: string;
  query: string;
  onQueryChange: (query: string) => void;
  searchPlaceholder: string;
  /** Overrides the header Back action (default: `router.back()`). */
  onBack?: () => void;
  /** Rendered in the header's right actions slot (e.g. a "Next" button). */
  headerActions?: ReactNode;
  /** The list content, rendered inside the scroll view. */
  children: ReactNode;
};

/**
 * Full-screen picker scaffold, fully custom (identical on iOS + Android): the
 * header (ScreenHeader + SearchField) is a fixed overlay whose frosted blur ramps
 * up as the list scrolls underneath. The blur/scroll wiring lives in
 * `ScreenHeader.ScrollArea` — this screen just composes the pieces.
 */
export function PickerScreen({
  title,
  query,
  onQueryChange,
  searchPlaceholder,
  onBack,
  headerActions,
  children,
}: PickerScreenProps) {
  return (
    <ScreenHeader.ScrollArea>
      <ScreenHeader.Body
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScreenHeader.Body>

      <ScreenHeader.Floating>
        <ScreenHeader>
          <ScreenHeader.Back onPress={onBack} />
          <ScreenHeader.Title>{title}</ScreenHeader.Title>
          {headerActions ? <ScreenHeader.Actions>{headerActions}</ScreenHeader.Actions> : null}
        </ScreenHeader>
        <View className="px-4 pb-4">
          <SearchField value={query} onChange={onQueryChange}>
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder={searchPlaceholder} autoFocus />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
        </View>
      </ScreenHeader.Floating>
    </ScreenHeader.ScrollArea>
  );
}

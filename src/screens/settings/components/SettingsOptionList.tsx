import { Fragment } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ListGroup, Separator, useThemeColor } from "heroui-native";
import { Check } from "lucide-react-native";
import { ScreenHeader } from "@/ui/ScreenHeader";

export type SettingsOption = {
  value: string;
  label: string;
  /** Secondary line under the label (e.g. a concrete example). */
  description?: string;
};

type SettingsOptionListProps = {
  /** Header title (also the back-stack title). */
  title: string;
  options: SettingsOption[];
  /** Currently selected value. */
  value: string;
  onSelect: (value: string) => void;
};

/**
 * Single-choice settings screen: a checkmark list inside the floating-header
 * scaffold. Same pattern as Display/Language, factored out for the Formatting
 * sub-screens (Date Format, Number Format, First Day of Week).
 */
export function SettingsOptionList({ title, options, value, onSelect }: SettingsOptionListProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const accent = useThemeColor("accent");

  // Select-and-return, like the category picker: no extra "back" tap.
  const handleSelect = (v: string) => {
    onSelect(v);
    router.back();
  };

  return (
    <ScreenHeader.ScrollArea>
      <ScreenHeader.Body
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
      >
        <View className="mb-6">
          <ListGroup>
            {options.map((opt, index) => (
              <Fragment key={opt.value}>
                {index > 0 && <Separator className="mx-4" />}
                <ListGroup.Item onPress={() => handleSelect(opt.value)}>
                  <ListGroup.ItemContent>
                    <ListGroup.ItemTitle>{opt.label}</ListGroup.ItemTitle>
                    {opt.description ? (
                      <ListGroup.ItemDescription>{opt.description}</ListGroup.ItemDescription>
                    ) : null}
                  </ListGroup.ItemContent>
                  {value === opt.value && (
                    <ListGroup.ItemSuffix>
                      <Check size={20} color={accent} />
                    </ListGroup.ItemSuffix>
                  )}
                </ListGroup.Item>
              </Fragment>
            ))}
          </ListGroup>
        </View>
      </ScreenHeader.Body>

      <ScreenHeader.Floating>
        <View style={{ height: insets.top }} />
        <ScreenHeader>
          <ScreenHeader.Back />
          <ScreenHeader.Title>{title}</ScreenHeader.Title>
        </ScreenHeader>
      </ScreenHeader.Floating>
    </ScreenHeader.ScrollArea>
  );
}

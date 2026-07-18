import { Button, useThemeColor } from "heroui-native";
import { Search } from "lucide-react-native";

/** Header action that opens the variant's dedicated token-search screen. */
export function SearchButton({ onPress }: { onPress: () => void }) {
  const foreground = useThemeColor("foreground");
  return (
    <Button variant="secondary" isIconOnly className="rounded-full" onPress={onPress}>
      <Search size={20} color={foreground} />
    </Button>
  );
}

import { SearchField } from "heroui-native";
import { cn } from "@/lib/cn";

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

export function SearchBar({
  value,
  onChange,
  placeholder = "Search...",
  className,
}: SearchBarProps) {
  return (
    <SearchField value={value} onChange={onChange} className={className}>
      <SearchField.Group>
        <SearchField.SearchIcon />
        <SearchField.Input placeholder={placeholder} className={cn("rounded-md")} />
        <SearchField.ClearButton />
      </SearchField.Group>
    </SearchField>
  );
}

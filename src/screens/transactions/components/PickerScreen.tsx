import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedProps,
  useAnimatedRef,
  useScrollOffset,
} from "react-native-reanimated";
import { SearchField } from "heroui-native";
import { ScreenHeader } from "@/components/ScreenHeader";

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);
/** Scroll distance over which the header blur ramps up. */
const FADE_DISTANCE = 32;
/** Max blur intensity — kept subtle. */
const MAX_INTENSITY = 12;

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
 * up as the list scrolls underneath. The blur is masked by a vertical gradient so
 * it dissolves to transparent at its bottom edge — revealing the sharp content
 * underneath, with no color band or hard line.
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
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollOffset = useScrollOffset(scrollRef);
  const [headerHeight, setHeaderHeight] = useState(120);

  // Animate `intensity` (not opacity) — iOS blur views ignore opacity.
  const blurProps = useAnimatedProps(() => ({
    intensity: interpolate(
      scrollOffset.value,
      [0, FADE_DISTANCE],
      [0, MAX_INTENSITY],
      Extrapolation.CLAMP,
    ),
  }));

  return (
    <View className="flex-1 bg-background">
      <Animated.ScrollView
        ref={scrollRef}
        style={styles.flex}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingTop: headerHeight,
          paddingHorizontal: 16,
          paddingBottom: 40,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </Animated.ScrollView>

      <View
        className="absolute inset-x-0 top-0"
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
      >
        <MaskedView
          style={StyleSheet.absoluteFill}
          maskElement={
            <LinearGradient
              colors={["#000", "#000", "transparent"]}
              locations={[0, 0.78, 1]}
              style={StyleSheet.absoluteFill}
            />
          }
        >
          <AnimatedBlurView
            tint="systemChromeMaterial"
            animatedProps={blurProps}
            style={StyleSheet.absoluteFill}
          />
        </MaskedView>
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});

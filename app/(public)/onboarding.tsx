import { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StatusBar,
  Text as RNText,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useTheme, useThemedStyles } from '../../src/presentation/providers/ThemeProvider';
import { Text } from '../../src/presentation/components/atoms/Text';
import { Icon } from '../../src/presentation/components/atoms/Icon';
import { usePrefsStore } from '../../src/stores/prefsStore';
import { palette } from '../../src/theme';
import type { Theme } from '../../src/theme';

const AnimatedText = Animated.createAnimatedComponent(RNText);

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TOTAL_PAGES = 3;

// ─── Page Dots ───────────────────────────────────────────────────────────────

function PageDots({
  currentPage,
  isHeroScreen,
}: {
  currentPage: number;
  isHeroScreen: boolean;
}) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const { t } = useTranslation('onboarding');

  const activeColor = isHeroScreen ? '#ffffff' : theme.colors.primary;
  const inactiveColor = isHeroScreen
    ? 'rgba(255,255,255,0.30)'
    : 'rgba(135,25,224,0.25)';

  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
      accessibilityLabel={t('pageOf', { current: currentPage + 1, total: TOTAL_PAGES })}
      accessibilityRole="adjustable"
    >
      {Array.from({ length: TOTAL_PAGES }).map((_, i) => (
        <Dot
          key={i}
          isActive={i === currentPage}
          activeColor={activeColor}
          inactiveColor={inactiveColor}
          reducedMotion={reducedMotion ?? false}
        />
      ))}
    </View>
  );
}

function Dot({
  isActive,
  activeColor,
  inactiveColor,
  reducedMotion,
}: {
  isActive: boolean;
  activeColor: string;
  inactiveColor: string;
  reducedMotion: boolean;
}) {
  const dotWidth = useSharedValue(isActive ? 20 : 8);

  useEffect(() => {
    const target = isActive ? 20 : 8;
    dotWidth.value = reducedMotion
      ? target
      : withSpring(target, { damping: 18, stiffness: 260 });
  }, [isActive]);

  const animStyle = useAnimatedStyle(() => ({
    width: dotWidth.value,
  }));

  return (
    <Animated.View
      style={[
        {
          height: 8,
          borderRadius: 4,
          backgroundColor: isActive ? activeColor : inactiveColor,
        },
        animStyle,
      ]}
    />
  );
}

// ─── Feature Row (Screen 1) ─────────────────────────────────────────────────

function FeatureRow({
  label,
  delay: delayMs = 0,
}: {
  label: string;
  delay?: number;
}) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    if (reducedMotion) return;
    opacity.value = withDelay(delayMs, withTiming(1, { duration: 350 }));
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          paddingVertical: theme.spacing.sm,
        },
        animStyle,
      ]}
    >
      <Icon name="checkmark-circle-outline" size={20} color={theme.colors.positive} />
      <Text variant="bodyLg" color={theme.colors.textPrimary}>
        {label}
      </Text>
    </Animated.View>
  );
}

// ─── Feature Card (Screen 2) ────────────────────────────────────────────────

function FeatureCard({
  iconName,
  title,
  body,
  delay: delayMs = 0,
}: {
  iconName: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
  title: string;
  body: string;
  delay?: number;
}) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const translateX = useSharedValue(reducedMotion ? 0 : 20);
  const opacity = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    if (reducedMotion) return;
    opacity.value = withDelay(delayMs, withTiming(1, { duration: 350 }));
    translateX.value = withDelay(
      delayMs,
      withSpring(0, { damping: 20, stiffness: 200 }),
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          flexDirection: 'row',
          gap: theme.spacing.md,
          backgroundColor: theme.colors.primarySubtle,
          borderRadius: theme.borderRadius.lg,
          padding: theme.spacing.lg,
        },
        animStyle,
      ]}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: theme.borderRadius.md,
          backgroundColor: theme.colors.primarySubtle,
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon name={iconName} size={22} color={theme.colors.primary} />
      </View>
      <View style={{ flex: 1, gap: theme.spacing.xs }}>
        <Text variant="headingSm" color={theme.colors.textPrimary}>
          {title}
        </Text>
        <Text variant="bodySm" color={theme.colors.textSecondary}>
          {body}
        </Text>
      </View>
    </Animated.View>
  );
}

// ─── Screen 0: Hero ─────────────────────────────────────────────────────────

function HeroScreen() {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const { t } = useTranslation('onboarding');

  const heroOpacity = useSharedValue(reducedMotion ? 1 : 0);
  const heroTranslateY = useSharedValue(reducedMotion ? 0 : 24);
  const pillsOpacity = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    if (reducedMotion) return;
    heroOpacity.value = withTiming(1, { duration: 500 });
    heroTranslateY.value = withTiming(0, { duration: 500 });
    pillsOpacity.value = withDelay(300, withTiming(1, { duration: 400 }));
  }, []);

  const heroStyle = useAnimatedStyle(() => ({
    opacity: heroOpacity.value,
    transform: [{ translateY: heroTranslateY.value }],
  }));

  const pillsStyle = useAnimatedStyle(() => ({
    opacity: pillsOpacity.value,
  }));

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.xl,
      }}
    >
      <Animated.View style={[{ alignItems: 'center', gap: theme.spacing.sm }, heroStyle]}>
        <Image
          source={require('../../assets/splash-icon.png')}
          style={{ width: 96, height: 96, resizeMode: 'contain', tintColor: '#ffffff' }}
          accessibilityIgnoresInvertColors
        />
        <Text
          variant="displayLg"
          color="#ffffff"
          align="center"
          style={{ letterSpacing: -1 }}
        >
          {t('heroTitle')}
        </Text>
        <Text variant="headingSm" color="rgba(255,255,255,0.80)" align="center">
          {t('heroSubtitle')}
        </Text>
      </Animated.View>

      <View
        style={{
          width: '60%',
          height: 1,
          backgroundColor: 'rgba(255,255,255,0.15)',
          marginVertical: theme.spacing.xl,
        }}
      />

      <Animated.View style={[{ flexDirection: 'row', gap: theme.spacing.sm }, pillsStyle]}>
        <FeaturePill icon="lock-closed-outline" label={t('pillPrivate')} />
        <FeaturePill icon="server-outline" label={t('pillNoSub')} />
      </Animated.View>
    </View>
  );
}

function FeaturePill({
  icon,
  label,
}: {
  icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
  label: string;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        paddingVertical: 6,
        paddingHorizontal: theme.spacing.md,
        backgroundColor: 'rgba(255,255,255,0.14)',
        borderRadius: theme.borderRadius.full,
      }}
    >
      <Icon name={icon} size={14} color="rgba(255,255,255,0.8)" />
      <Text variant="captionSm" color="rgba(255,255,255,0.8)" style={{ fontWeight: '500' }}>
        {label}
      </Text>
    </View>
  );
}

// ─── Screen 1: Privacy ──────────────────────────────────────────────────────

function PrivacyScreen() {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const { t } = useTranslation('onboarding');

  const cardTranslateY = useSharedValue(reducedMotion ? 0 : 32);
  const cardOpacity = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    if (reducedMotion) return;
    cardOpacity.value = withTiming(1, { duration: 400 });
    cardTranslateY.value = withSpring(0, { damping: 18, stiffness: 200 });
  }, []);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardTranslateY.value }],
  }));

  return (
    <View
      style={{
        flex: 1,
        paddingHorizontal: theme.spacing.xl,
        justifyContent: 'center',
        gap: theme.spacing.xl,
      }}
    >
      <Animated.View
        style={[
          {
            backgroundColor: theme.colors.cardBackground,
            borderRadius: theme.borderRadius.lg,
            padding: theme.spacing.xl,
            alignItems: 'center',
            gap: theme.spacing.md,
            ...theme.shadows.elevated,
          },
          cardStyle,
        ]}
      >
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: theme.borderRadius.lg,
            backgroundColor: theme.colors.primarySubtle,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="server-outline" size={32} color={theme.colors.primary} />
        </View>
        <Text
          variant="headingLg"
          color={theme.colors.textPrimary}
          align="center"
          accessibilityRole="header"
        >
          {t('privacyHeading')}
        </Text>
        <Text
          variant="body"
          color={theme.colors.textSecondary}
          align="center"
          style={{ lineHeight: 22 }}
        >
          {t('privacyBody')}
        </Text>
      </Animated.View>

      <View style={{ gap: 0 }}>
        <FeatureRow label={t('featureEncrypted')} delay={200} />
        <FeatureRow label={t('featureOpenSource')} delay={280} />
        <FeatureRow label={t('featureNoTracking')} delay={360} />
      </View>
    </View>
  );
}

// ─── Screen 2: Features ─────────────────────────────────────────────────────

function FeaturesScreen() {
  const theme = useTheme();
  const { t } = useTranslation('onboarding');

  return (
    <View
      style={{
        flex: 1,
        paddingHorizontal: theme.spacing.xl,
        justifyContent: 'center',
        gap: theme.spacing.xl,
      }}
    >
      <View style={{ gap: theme.spacing.sm }}>
        <Text
          variant="displaySm"
          color={theme.colors.textPrimary}
          style={{ letterSpacing: -0.5 }}
          accessibilityRole="header"
        >
          {t('featuresHeading')}
        </Text>
        <Text variant="body" color={theme.colors.textSecondary}>
          {t('featuresSubtitle')}
        </Text>
      </View>

      <View style={{ gap: theme.spacing.md }}>
        <FeatureCard
          iconName="layers-outline"
          title={t('cardEnvelopeTitle')}
          body={t('cardEnvelopeBody')}
          delay={0}
        />
        <FeatureCard
          iconName="wallet-outline"
          title={t('cardAccountsTitle')}
          body={t('cardAccountsBody')}
          delay={60}
        />
        <FeatureCard
          iconName="bar-chart-outline"
          title={t('cardInsightsTitle')}
          body={t('cardInsightsBody')}
          delay={120}
        />
      </View>
    </View>
  );
}

// ─── Main Onboarding Screen ─────────────────────────────────────────────────

export default function OnboardingScreen() {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const markOnboardingSeen = usePrefsStore((s) => s.markOnboardingSeen);
  const { t } = useTranslation('onboarding');
  const { t: tc } = useTranslation('common');

  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const scrollX = useSharedValue(0);

  const isHeroScreen = page === 0;
  const isLastPage = page === TOTAL_PAGES - 1;

  const pageBackground = theme.colors.pageBackground;
  const primaryColor = theme.colors.primary;

  const rootAnimStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      scrollX.value,
      [0, SCREEN_WIDTH],
      [palette.purple500, pageBackground],
    ),
  }));

  const ctaStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      scrollX.value,
      [0, SCREEN_WIDTH],
      ['#ffffff', primaryColor],
    ),
  }));

  const ctaTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      scrollX.value,
      [0, SCREEN_WIDTH],
      [palette.purple500, '#ffffff'],
    ),
  }));

  const skipTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      scrollX.value,
      [0, SCREEN_WIDTH],
      ['rgba(255,255,255,0.70)', primaryColor],
    ),
  }));

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    scrollX.value = e.nativeEvent.contentOffset.x;
  }

  function handleScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const newPage = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (newPage !== page) setPage(newPage);
  }

  function goToPage(next: number) {
    if (next >= TOTAL_PAGES) return finish();
    scrollRef.current?.scrollTo({ x: next * SCREEN_WIDTH, animated: true });
    setPage(next);
  }

  function finish() {
    markOnboardingSeen();
    router.replace('/(public)/');
  }

  return (
    <Animated.View style={[styles.root, rootAnimStyle]}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleScrollEnd}
        style={{ flex: 1 }}
      >
        <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
          <HeroScreen />
        </View>
        <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
          <PrivacyScreen />
        </View>
        <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
          <FeaturesScreen />
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom, theme.spacing.xl) },
        ]}
      >
        <View style={styles.dotsRow}>
          <PageDots currentPage={page} isHeroScreen={isHeroScreen} />
          <Pressable
            onPress={finish}
            hitSlop={12}
            accessibilityLabel={t('skip')}
            accessibilityRole="button"
          >
            <AnimatedText
              style={[{ fontSize: 15, lineHeight: 21, fontWeight: '600' }, skipTextStyle]}
            >
              {t('skip')}
            </AnimatedText>
          </Pressable>
        </View>

        <Pressable
          onPress={() => (isLastPage ? finish() : goToPage(page + 1))}
          style={({ pressed }) => [pressed && { opacity: 0.8 }]}
        >
          <Animated.View style={[styles.ctaButton, ctaStyle]}>
            <AnimatedText
              style={[{ fontSize: 16, fontWeight: '600' }, ctaTextStyle]}
            >
              {isLastPage ? t('letsGo') : page === 0 ? t('getStarted') : tc('continue')}
            </AnimatedText>
          </Animated.View>
        </Pressable>
      </View>
    </Animated.View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const createStyles = (theme: Theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
  },
  footer: {
    paddingHorizontal: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  dotsRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  ctaButton: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: 44,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: theme.borderRadius.full,
  },
});

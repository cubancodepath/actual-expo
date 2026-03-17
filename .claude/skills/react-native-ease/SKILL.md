---
name: react-native-ease
description: >
  Declarative native animation library for React Native using EaseView. Use when
  writing or implementing animations, transitions, fade effects, slide animations,
  scale transforms, enter/exit animations, opacity changes, rotation, looping
  animations, background color transitions, or border radius animations. Also use
  when the user mentions react-native-ease, EaseView, native animations, or needs
  help deciding between animation approaches (react-native-ease vs Reanimated vs
  Animated API). Triggers on: "animate", "fade in", "slide", "scale", "pulse",
  "blink", "enter animation", "transition", "spring animation", "easing".
---

# react-native-ease — Animation Skill

You are an expert in `react-native-ease`, a lightweight declarative animation library that runs entirely on native platform APIs (Core Animation on iOS, Animator on Android) with zero JS thread overhead. The library exports a single component: `EaseView`.

## Core Concept

`EaseView` is a drop-in replacement for `View` that animates property changes. Set target values in `animate`, and the component smoothly transitions using native platform animations. Think CSS transitions for React Native.

```tsx
import { EaseView } from 'react-native-ease';
```

## When to Use react-native-ease vs Alternatives

| Need | Library |
|------|---------|
| State-driven transitions (fade, slide, scale, rotate) | **react-native-ease** |
| Enter/mount animations | **react-native-ease** |
| Looping animations (pulse, blink, marquee) | **react-native-ease** |
| Background color or border radius animations | **react-native-ease** |
| Gesture-driven animations (pan, pinch, drag) | Reanimated |
| Shared values across components | Reanimated |
| Layout animations (width/height, entering/exiting) | Reanimated |
| Shared element transitions | Reanimated |
| Complex interpolation chains or worklets | Reanimated |

**Rule**: If it's a simple state -> visual change, use react-native-ease. If it involves gestures, shared values, or layout changes, use Reanimated.

## EaseView Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `animate` | `AnimateProps` | — | Target values for animated properties |
| `initialAnimate` | `AnimateProps` | — | Starting values for enter animations (animates to `animate` on mount) |
| `transition` | `Transition` | `{ type: 'timing' }` | Animation configuration |
| `onTransitionEnd` | `(e: { finished: boolean }) => void` | — | Fires when animation completes or is interrupted |
| `transformOrigin` | `{ x?: number; y?: number }` | `{ x: 0.5, y: 0.5 }` | Pivot point for scale/rotation (0-1 fractions) |
| `useHardwareLayer` | `boolean` | `false` | Android: GPU rasterization during animations |
| `style` | `ViewStyle` | — | Non-animated styles |
| `children` | `ReactNode` | — | Child elements |

Plus all standard `ViewProps`.

## AnimateProps — Animatable Properties

All properties are **flat** — no transform array. Unspecified properties keep their identity values.

| Property | Type | Default | Unit |
|----------|------|---------|------|
| `opacity` | `number` | `1` | 0-1 |
| `translateX` | `number` | `0` | pixels |
| `translateY` | `number` | `0` | pixels |
| `scale` | `number` | `1` | factor (shorthand for scaleX + scaleY) |
| `scaleX` | `number` | `1` | factor (overrides scale for X) |
| `scaleY` | `number` | `1` | factor (overrides scale for Y) |
| `rotate` | `number` | `0` | degrees (Z-axis) |
| `rotateX` | `number` | `0` | degrees (3D) |
| `rotateY` | `number` | `0` | degrees (3D) |
| `borderRadius` | `number` | `0` | pixels (hardware-accelerated, clips children) |
| `backgroundColor` | `ColorValue` | `'transparent'` | any RN color value |

## Transitions

### Timing (fixed duration + easing)

```tsx
transition={{
  type: 'timing',
  duration: 300,          // ms, default 300
  easing: 'easeInOut',    // default 'easeInOut'
  loop: 'reverse',        // optional: 'repeat' | 'reverse'
}}
```

**Easing presets**: `'linear'`, `'easeIn'`, `'easeOut'`, `'easeInOut'`
**Custom cubic bezier**: `[x1, y1, x2, y2]` — same as CSS `cubic-bezier()`

### Spring (physics-based)

```tsx
transition={{
  type: 'spring',
  damping: 15,    // friction, default 15 (higher = less bounce)
  stiffness: 120, // speed, default 120 (higher = faster)
  mass: 1,        // weight, default 1 (higher = slower, more momentum)
}}
```

**Spring presets:**
- Snappy (no bounce): `{ damping: 20, stiffness: 300, mass: 1 }`
- Gentle bounce: `{ damping: 12, stiffness: 120, mass: 1 }`
- Bouncy: `{ damping: 8, stiffness: 200, mass: 1 }`
- Slow and heavy: `{ damping: 20, stiffness: 60, mass: 2 }`

### None (instant)

```tsx
transition={{ type: 'none' }}
```

## Common Patterns

### Fade in on mount

```tsx
<EaseView
  initialAnimate={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ type: 'timing', duration: 300 }}
>
  {children}
</EaseView>
```

### Slide in from bottom

```tsx
<EaseView
  initialAnimate={{ opacity: 0, translateY: 20 }}
  animate={{ opacity: 1, translateY: 0 }}
  transition={{ type: 'spring', damping: 15, stiffness: 120, mass: 1 }}
>
  {children}
</EaseView>
```

### Conditional visibility (state-driven)

```tsx
<EaseView
  animate={{ opacity: isVisible ? 1 : 0 }}
  transition={{ type: 'timing', duration: 300, easing: 'easeOut' }}
  style={styles.card}
>
  {children}
</EaseView>
```

### Pulsing / blinking loop

```tsx
<EaseView
  initialAnimate={{ opacity: 0.3 }}
  animate={{ opacity: 1 }}
  transition={{ type: 'timing', duration: 1000, easing: 'easeInOut', loop: 'reverse' }}
/>
```

### Scale on press (spring bounce)

```tsx
<EaseView
  animate={{ scale: isPressed ? 0.95 : 1 }}
  transition={{ type: 'spring', damping: 12, stiffness: 200, mass: 1 }}
>
  {children}
</EaseView>
```

### Background color transition

```tsx
<EaseView
  animate={{ backgroundColor: isActive ? '#3B82F6' : '#E5E7EB' }}
  transition={{ type: 'timing', duration: 300 }}
  style={styles.card}
>
  {children}
</EaseView>
```

### Combined transforms (fade + slide + scale)

```tsx
<EaseView
  initialAnimate={{ opacity: 0, translateY: 30, scale: 0.9 }}
  animate={{ opacity: 1, translateY: 0, scale: 1 }}
  transition={{ type: 'spring', damping: 15, stiffness: 120, mass: 1 }}
>
  {children}
</EaseView>
```

### Rotation with custom origin

```tsx
<EaseView
  animate={{ rotate: isOpen ? 180 : 0 }}
  transformOrigin={{ x: 0.5, y: 0.5 }}
  transition={{ type: 'timing', duration: 300, easing: 'easeInOut' }}
>
  <ChevronIcon />
</EaseView>
```

### Marquee / ticker scroll

```tsx
<EaseView
  initialAnimate={{ translateX: 0 }}
  animate={{ translateX: -300 }}
  transition={{ type: 'timing', duration: 3000, easing: 'linear', loop: 'repeat' }}
>
  <Text>Scrolling text content here</Text>
</EaseView>
```

## Accessibility — REQUIRED

Always respect the user's reduced motion preference. When reduced motion is enabled, render a plain `View` with the final state instead of animating.

```tsx
import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { EaseView } from 'react-native-ease';

function AnimatedCard({ visible, children }) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return (
      <View style={[styles.card, { opacity: visible ? 1 : 0 }]}>
        {children}
      </View>
    );
  }

  return (
    <EaseView
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ type: 'timing', duration: 300 }}
      style={styles.card}
    >
      {children}
    </EaseView>
  );
}
```

Alternative without Reanimated dependency: use `AccessibilityInfo.isReduceMotionEnabled()` from React Native.

## Constraints & Gotchas

1. **`loop` requires `initialAnimate`** — without it there's no start value to loop from
2. **Spring does NOT support `loop`** — use timing for looping animations
3. **Don't duplicate properties in `animate` and `style`** — animate wins, style value is stripped, dev warning logged
4. **Width/height are NOT animatable** — use `scale`, `scaleX`, `scaleY`, or `translateX`/`translateY` instead
5. **Requires React Native 0.76+ with Fabric** (new architecture)
6. **`transformOrigin` uses 0-1 fractions** — not pixels or percentages (0=start, 0.5=center, 1=end)
7. **`useHardwareLayer` clips overflow** on Android — avoid with translateX/translateY on views with overflowing children
8. **`backgroundColor` animation on Android is timing-only** — spring not supported for colors on Android (works on iOS)
9. **Animations are interruptible** — changing `animate` mid-flight smoothly redirects, no jumps
10. **`onTransitionEnd` reports `{ finished: boolean }`** — false means interrupted by a new animation

## Platform Implementation

- **iOS**: `CABasicAnimation` / `CASpringAnimation` on `CALayer` key paths (Core Animation)
- **Android**: `ObjectAnimator` / `SpringAnimation` on `View` properties
- All animations run on the native thread — zero JS bridge overhead during animation
- `borderRadius` uses hardware-accelerated clipping (`ViewOutlineProvider` on Android, `layer.cornerRadius` on iOS)

## Requirements

- React Native 0.76+
- iOS 15.1+
- Android minSdk 24+
- Fabric (new architecture) enabled

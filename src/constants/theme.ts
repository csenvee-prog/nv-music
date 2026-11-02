/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
  },
} as const;

/**
 * NV Music premium dark palette (Apple Music-inspired).
 *
 * A near-black / charcoal surface system with a single accent color.
 * These are the "elevated" surfaces layered on top of `Colors.dark.background`.
 * Prefer referencing these tokens over hardcoding hex values in components.
 */
export const Premium = {
  /** App background — deep charcoal as per Apple Music spec. */
  background: '#121212',
  /** Default card / surface. */
  surface: '#1e1e1e',
  /** Elevated surface (cards on top of surface). */
  surfaceElevated: '#252526',
  /** Highest elevation (player sheets, overlays). */
  surfaceHigh: '#2a2a2a',
  /** Subtle divider / hairline. */
  divider: '#313135',
  /** Primary brand accent. */
  accent: '#1db954',
  /** Accent pressed / dim state. */
  accentDim: '#17A34A',
  /** Accent on a dark background (text color). */
  accentForeground: '#000000',
  /** Primary text. */
  text: '#FFFFFF',
  /** Secondary text (artist names, subtitles). */
  textSecondary: '#b3b3b3',
  /** Tertiary / hint text. */
  textTertiary: '#757575',
  /** Always-white artwork tint for placeholders. */
  artworkTint: '#333333',
} as const;

/** The single accent color used for CTAs and the progress bar. */
export const AccentColor = Premium.accent;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 12,
  four: 16,
  five: 24,
  six: 32,
} as const;

/** Card sizes per Apple Music home design */
export const CardSize = {
  /** Track card: 120x120px album art */
  track: 120,
  /** Large card: 480x480px for featured albums */
  large: 480,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 0 }) ?? 0;
export const MaxContentWidth = 800;

/**
 * Platform-specific status bar height (safe area top inset)
 */
export const StatusBarHeight = Platform.select({ ios: 44, android: 0 }) ?? 0;
export const SafeAreaBottom = Platform.select({ ios: 34, android: 0 }) ?? 0;

/**
 * Player layout constants.
 *
 * The mini-player sits directly above the native tab bar.
 * MiniPlayerHeight includes the full height of the bar (64px).
 */
export const MiniPlayerHeight = 64; // compact bar showing current track
export const NowPlayingHeaderHeight = 220; // artwork area at the top of the player
export const PlayerControlHeight = 120; // seekbar + transport controls

// Native tab bar height (Material Design for Android, iOS standard)
export const TabBarHeight = Platform.select({ ios: 50, android: 56 }) ?? 56;

// For tab screens with MiniPlayer: content must be padded by MiniPlayerHeight
// This ensures content doesn't overlap the persistent player bar
export const ContentBottomPadding = MiniPlayerHeight;

// For now-playing screen without mini-player, just account for tab bar and safe area
export const TabBottomReservation = TabBarHeight + BottomTabInset;

/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyles.io/), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

/**
 * Light mode - marshmallow white base
 */
export const Colors = {
  light: {
    text: '#1a1a1a',
    background: '#f8fafc',
    backgroundElement: '#f0f7ff',
    backgroundSelected: '#e8f0f8',
    textSecondary: '#64748b',
  },
  dark: {
    text: '#f8fafc',
    background: '#0f0e17',
    backgroundElement: '#1e1c27',
    backgroundSelected: '#2a2936',
    textSecondary: '#94a3b8',
  },
} as const;

/**
 * NV Music galactic palette - marshmallow white base with violet and bubblegum accents.
 *
 * A soft, approachable palette with a warm white base, deep violet accent,
 * and bubblegum pink highlights for a distinctive, modern look.
 */
export const Premium = {
  /** App background — marshmallow white as per new spec. */
  background: '#fdf6e3',
  /** Default card / surface. */
  surface: '#ffffff',
  /** Elevated surface (cards on top of surface). */
  surfaceElevated: '#f8fafc',
  /** Highest elevation (player sheets, overlays). */
  surfaceHigh: '#f1f5f9',
  /** Subtle divider / hairline. */
  divider: '#cbd5e1',
  /** Primary brand accent — galactic violet. */
  accent: '#7f1d7f',
  /** Accent pressed / dim state. */
  accentDim: '#6b1c6b',
  /** Accent on a dark background (text color). */
  accentForeground: '#ffffff',
  /** Primary text. */
  text: '#1e293b',
  /** Secondary text (artist names, subtitles). */
  textSecondary: '#64748b',
  /** Tertiary / hint text. */
  textTertiary: '#94a3b8',
  /** Always-white artwork tint for placeholders. */
  artworkTint: '#334155',
  /** Bubblegum pink splash color for highlights and CTA. */
  bubblegum: '#ff6b6b',
  /** Bubblegum pink pressed/dim state. */
  bubblegumDim: '#ff5252',
} as const;

/** The single accent color used for CTAs and the progress bar. */
export const AccentColor = Premium.accent;

/** The bubblegum pink highlight color. */
export const BubblegumColor = Premium.bubblegum;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/** Font definitions remain the same across themes */
export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
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

/** Card sizes */
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
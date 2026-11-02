/**
 * AlbumArt - Album artwork display with fallback
 *
 * Design: Square cards with subtle shadow and rounded corners
 * Features:
 * - Fallback to placeholder gradient when no artwork
 * - Consistent sizing
 */

import React from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { Premium, Spacing } from '@/constants/theme';

interface AlbumArtProps {
  /** Album artwork URL (can be null/undefined) */
  source: string | null | undefined;
  /** Width in pixels */
  size: number;
  /** Border radius */
  borderRadius?: number;
  /** Album title for fallback placeholder */
  title?: string;
  /** Artist name for fallback placeholder */
  artist?: string;
  /** Custom style overrides */
  style?: any;
}

export function AlbumArt({
  source,
  size,
  borderRadius = Spacing.three,
  title,
  artist,
  style,
}: AlbumArtProps) {
  // Render placeholder when no artwork
  if (!source) {
    return (
      <View
        style={[
          styles.placeholder,
          { width: size, height: size, borderRadius },
          style,
        ]}
      >
        <View style={styles.gradientPlaceholder}>
          <View style={styles.placeholderPattern}>
            {Array.from({ length: 8 }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.placeholderDot,
                  {
                    left: 12 + (i % 4) * 6,
                    top: 12 + Math.floor(i / 4) * 6,
                    opacity: 0.3 + (i * 0.08),
                  },
                ]}
              />
            ))}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { width: size, height: size, borderRadius }, style]}>
      <Image
        source={{ uri: source }}
        style={styles.image}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: Premium.surface,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Premium.surfaceElevated,
  },
  gradientPlaceholder: {
    width: '80%',
    height: '40%',
    borderRadius: 4,
    backgroundColor: Premium.divider,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderPattern: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderDot: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Premium.accent,
  },
});
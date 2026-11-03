/**
 * ControlRow - Transport controls with state-aware styling
 *
 * Design: Horizontal row of 5 controls
 * - Shuffle/Repeat: Rotated when active
 * - Play: Central, most prominent
 * - All icons: 24×24px with state-aware tinting
 * - Accessibility: All icon-only buttons have accessibility labels
 * - Color scheme: Marshmallow white base with galactic violet and bubblegum pink accents
 */

import React from 'react';
import { View, TouchableOpacity, Image, StyleSheet, Platform } from 'react-native';
import { Premium } from '@/constants/theme';
import { usePlayerStore } from '@/store/player';

interface ControlRowProps {
  showLabels?: boolean;
  compact?: boolean;
}

export function ControlRow({ showLabels = false, compact = true }: ControlRowProps) {
  const { isPlaying, togglePlay, isShuffle, toggleShuffle, repeatMode, setRepeat, prev, next } = usePlayerStore();

  const handleRepeatPress = () => {
    const nextMode = repeatMode === 'off' ? 'all' :
                    repeatMode === 'all' ? 'track' : 'off';
    setRepeat(nextMode);
  };

  const iconSize = compact ? 24 : 28;

  return (
    <View style={styles.container}>
      {/* Shuffle */}
      <TouchableOpacity
        onPress={toggleShuffle}
        style={styles.controlButton}
        activeOpacity={0.7}
      >
        <Image
          source={require('@/assets/icons/shuffle_icon.png')}
          style={[
            styles.controlIcon,
            { width: iconSize, height: iconSize },
            isShuffle && styles.shuffleActive,
          ]}
          tintColor={isShuffle ? Premium.accent : Premium.textSecondary}
          resizeMode="contain"
          accessibilityLabel={isShuffle ? 'Turn off shuffle' : 'Turn on shuffle'}
        />
      </TouchableOpacity>

      {/* Previous */}
      <TouchableOpacity
        onPress={prev}
        style={styles.controlButton}
        activeOpacity={0.7}
      >
        <Image
          source={require('@/assets/icons/previous.png')}
          style={[styles.controlIcon, { width: iconSize, height: iconSize }]}
          tintColor={Premium.text}
          resizeMode="contain"
          accessibilityLabel="Previous track"
        />
      </TouchableOpacity>

      {/* Play/Pause */}
      <TouchableOpacity
        onPress={togglePlay}
        style={styles.playContainer}
        activeOpacity={0.7}
        hitSlop={10}
      >
        <View style={[styles.playButton, { width: iconSize * 2.5, height: iconSize * 2.5 }]}>
          <Image
            source={isPlaying
              ? require('@/assets/icons/pause.png')
              : require('@/assets/icons/play.png')
            }
            style={[styles.playIcon, { width: iconSize * 0.7, height: iconSize * 0.7 }]}
            tintColor={Premium.accentForeground}
            resizeMode="contain"
            accessibilityLabel={isPlaying ? 'Pause playback' : 'Play pause'}
          />
        </View>
      </TouchableOpacity>

      {/* Next */}
      <TouchableOpacity
        onPress={next}
        style={styles.controlButton}
        activeOpacity={0.7}
      >
        <Image
          source={require('@/assets/icons/next.png')}
          style={[styles.controlIcon, { width: iconSize, height: iconSize }]}
          tintColor={Premium.text}
          resizeMode="contain"
          accessibilityLabel="Next track"
        />
      </TouchableOpacity>

      {/* Repeat */}
      <TouchableOpacity
        onPress={handleRepeatPress}
        style={styles.controlButton}
        activeOpacity={0.7}
      >
        <Image
          source={require('@/assets/icons/repeat_icon.png')}
          style={[
            styles.controlIcon,
            { width: iconSize, height: iconSize },
            repeatMode !== 'off' && styles.repeatActive,
          ]}
          tintColor={repeatMode !== 'off' ? Premium.accent : Premium.textSecondary}
          resizeMode="contain"
          accessibilityLabel={repeatMode !== 'off' ? 'Turn off repeat' : 'Turn on repeat'}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
  },
  controlButton: {
    padding: 8,
    borderRadius: 8,
    ...Platform.select({
      web: {
        outline: '2px solid var(--focus-color, #7f1d7f)',
        outlineOffset: 2,
      },
      native: {},
    }),
  },
  playContainer: {
    padding: 8,
  },
  playButton: {
    backgroundColor: Premium.accent,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: Premium.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  playIcon: {
    resizeMode: 'contain',
  },
  controlIcon: {
    resizeMode: 'contain',
    tintColor: Premium.textSecondary,
  },
  shuffleActive: {
    transform: [{ rotate: '-45deg' }],
  },
  repeatActive: {
    transform: [{ rotate: '180deg' }],
  },
});
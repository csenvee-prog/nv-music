/**
 * PlayButton - Circular playback control with press feedback
 *
 * Design: Centerpiece of the player experience
 * - Circular accent button
 * - Premium elevation shadow
 * - Immediate feedback on press
 */

import React from 'react';
import {
  TouchableOpacity,
  StyleSheet,
  Image,
  View,
} from 'react-native';
import { Premium } from '@/constants/theme';
import { usePlayerStore } from '@/store/player';

interface PlayButtonProps {
  size?: number;
  onPress?: () => void;
}

export function PlayButton({ size = 72, onPress }: PlayButtonProps) {
  const { isPlaying } = usePlayerStore();

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      usePlayerStore.getState().togglePlay();
    }
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.8} style={styles.touchable}>
      <View style={[styles.button, { width: size, height: size, borderRadius: size / 2 }]}>
        <Image
          source={isPlaying
            ? require('@/assets/icons/pause.png')
            : require('@/assets/icons/play.png')
          }
          style={[styles.icon, { width: size * 0.45, height: size * 0.45 }]}
          tintColor={Premium.accentForeground}
          resizeMode="contain"
        />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  touchable: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  button: {
    backgroundColor: Premium.accent,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Premium.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  icon: {
    resizeMode: 'contain',
  },
});
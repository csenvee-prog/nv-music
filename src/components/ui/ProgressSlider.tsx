/**
 * ProgressSlider - Custom seek bar with tap-to-seek
 *
 * Design: NV Music dark theme with accent progress fill
 * Interaction: Tap to seek for now, drag support available via PanResponder
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Premium, Spacing } from '@/constants/theme';

const { width: screenWidth } = Dimensions.get('window');

interface ProgressSliderProps {
  /** Duration in seconds */
  duration: number;
  /** Current position in seconds */
  position: number;
  /** Seek function */
  onSeek: (seconds: number) => void;
}

export function ProgressSlider({ duration, position, onSeek }: ProgressSliderProps) {
  const [width, setWidth] = useState(screenWidth - Spacing.four * 2);

  const progress = duration > 0 ? (position / duration) * 100 : 0;

  const handlePress = useCallback((event: any) => {
    if (duration <= 0 || width <= 0) return;

    const locationX = event.nativeEvent.locationX;
    const progressRatio = Math.max(0, Math.min(1, locationX / width));
    const seekSeconds = progressRatio * duration;

    onSeek(seekSeconds);
  }, [duration, width, onSeek]);

  return (
    <View style={styles.container}>
      {/* Background track */}
      <View style={styles.track} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {/* Progress fill */}
        <View style={[styles.fill, { width: `${progress}%` }]} />
      </View>

      {/* Touchable area for tap-to-seek */}
      <TouchableOpacity
        style={styles.touchable}
        activeOpacity={1}
        onPress={handlePress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: Spacing.four,
    justifyContent: 'center',
    alignItems: 'center',
  },
  track: {
    width: '100%',
    height: 4,
    backgroundColor: Premium.divider,
    borderRadius: 2,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: Premium.accent,
    borderRadius: 2,
  },
  touchable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: -20,
  },
});
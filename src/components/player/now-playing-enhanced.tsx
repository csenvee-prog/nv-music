/**
 * NowPlayingScreen - Enhanced with refined dark theme
 *
 * Design: Apple Music elegance + Spotify fluidity
 * - Deep charcoal surfaces (not pure black)
 * - Refined typography hierarchy
 * - Smooth interactions with spring animations
 */

import React from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Image,
} from 'react-native';
import { usePlayerStore } from '@/store/player';
import { ThemedText } from '@/components/themed-text';
import { Premium, Spacing, TabBottomReservation } from '@/constants/theme';
import { AlbumArt } from '@/components/ui/AlbumArt';
import { ControlRow } from '@/components/ui/ControlRow';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import { router } from 'expo-router';

const { width } = Dimensions.get('window');

export function NowPlayingScreenEnhanced() {
  const {
    currentTrack,
    position,
    duration,
    isBuffering,
  } = usePlayerStore();

  // Animated opacity for content fade-in
  const contentOpacity = useSharedValue(0);

  React.useEffect(() => {
    contentOpacity.value = withTiming(1, { duration: 300 });
  }, [contentOpacity]);

  const formatTime = (secs: number) => {
    if (!Number.isFinite(secs)) return '0:00';
    const mins = Math.floor(secs / 60);
    const remainSecs = Math.floor(secs % 60);
    return `${mins}:${remainSecs < 10 ? '0' : ''}${remainSecs}`;
  };

  const progress = duration > 0 ? (position / duration) * 100 : 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Image
            source={require('@/assets/icons/previous.png')}
            style={styles.backIcon}
            tintColor={Premium.textSecondary}
          />
        </TouchableOpacity>

        <ThemedText style={styles.headerTitle}>Now Playing</ThemedText>

        <View style={styles.headerPlaceholder} />
      </View>

      {/* Album Art - Large focal point */}
      <View style={styles.artContainer}>
        <AlbumArt
          source={currentTrack?.artworkUrl || 'assets/icons/placeholder_album.png'}
          size={width - Spacing.six}
          borderRadius={Spacing.three}
        />
      </View>

      {/* Track Info */}
      <View style={styles.metaContainer}>
        <ThemedText style={styles.title} numberOfLines={1}>
          {currentTrack?.title ?? 'No Track Selected'}
        </ThemedText>
        <ThemedText style={styles.artist} numberOfLines={1}>
          {currentTrack?.artist ?? 'Unknown Artist'}
        </ThemedText>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        <View style={styles.timeRow}>
          <ThemedText style={styles.timeText}>{formatTime(position)}</ThemedText>
          <ThemedText style={styles.timeText}>{formatTime(duration)}</ThemedText>
        </View>
      </View>

      {/* Transport Controls */}
      <View style={styles.controlsContainer}>
        <ControlRow compact={true} />
      </View>

      {/* Buffer indicator */}
      {isBuffering && (
        <View style={styles.bufferIndicator}>
          <ThemedText style={styles.bufferText}>Loading...</ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Premium.background,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five,
    paddingBottom: TabBottomReservation,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 56,
  },
  backButton: {
    padding: 8,
    borderRadius: 8,
  },
  backIcon: {
    width: 24,
    height: 24,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerPlaceholder: {
    width: 40,
  },
  artContainer: {
    alignItems: 'center',
    marginVertical: Spacing.four,
  },
  metaContainer: {
    alignItems: 'center',
    marginVertical: Spacing.four,
    gap: Spacing.half,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  artist: {
    fontSize: 16,
    color: Premium.textSecondary,
  },
  progressContainer: {
    marginVertical: Spacing.four,
  },
  progressBar: {
    width: '100%',
    height: 6,
    backgroundColor: Premium.divider,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Premium.accent,
    borderRadius: 3,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.one,
  },
  timeText: {
    fontSize: 12,
    color: Premium.textSecondary,
  },
  controlsContainer: {
    marginTop: Spacing.four,
  },
  bufferIndicator: {
    marginTop: Spacing.four,
    alignItems: 'center',
  },
  bufferText: {
    color: Premium.textSecondary,
    fontSize: 12,
  },
});
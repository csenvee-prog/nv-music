import React from 'react';
import { View, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { usePlayerStore } from '@/store/player';
import { useLikesStore } from '@/store/likes';
import { ThemedText } from '@/components/themed-text';
import { Premium, Spacing, TabBottomReservation } from '@/constants/theme';
import { AlbumArt } from '@/components/ui/AlbumArt';
import { ControlRow } from '@/components/ui/ControlRow';

/**
 * Now Playing Screen - Enhanced with like button and proper progress bar
 */
export function NowPlayingScreen() {
  const { currentTrack, position, duration, seek } = usePlayerStore();
  const { isLiked, likeTrack, unlikeTrack } = useLikesStore();
  const [progressBarWidth, setProgressBarWidth] = React.useState(0);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainSecs = Math.floor(secs % 60);
    return `${mins}:${remainSecs < 10 ? '0' : ''}${remainSecs}`;
  };

  const progress = duration > 0 ? (position / duration) * 100 : 0;

  const handleSeekBarPress = (event: any) => {
    if (duration <= 0 || progressBarWidth <= 0) return;

    const { locationX } = event.nativeEvent;
    const progressRatio = Math.max(0, Math.min(1, locationX / progressBarWidth));
    const targetSeconds = progressRatio * duration;

    seek(targetSeconds);
  };

  const handleLike = () => {
    if (currentTrack) {
      if (isLiked(currentTrack.id)) {
        unlikeTrack(currentTrack.id);
      } else {
        likeTrack(currentTrack.id);
      }
    }
  };

  return (
    <View style={styles.container}>
      {/* Header with Like Button */}
      <View style={styles.header}>
        <View style={{ width: 24 }} />
        <ThemedText style={styles.headerTitle}>Now Playing</ThemedText>
        <TouchableOpacity onPress={handleLike} style={styles.likeButton}>
          {currentTrack && (
            <Image
              source={require('@/assets/icons/heart_like_icon.png')}
              style={styles.likeIcon}
              tintColor={isLiked(currentTrack.id) ? Premium.accent : Premium.textSecondary}
              resizeMode="contain"
            />
          )}
        </TouchableOpacity>
      </View>

      {/* Album Artwork */}
      <View style={styles.artworkContainer}>
        <AlbumArt
          source={currentTrack?.artworkUrl}
          size={240}
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

      {/* Progress Bar with Tap-to-Seek */}
      <View style={styles.progressContainer}>
        <TouchableOpacity
          style={styles.seekTouchable}
          activeOpacity={1}
          onPress={handleSeekBarPress}
          onLayout={(event) => setProgressBarWidth(event.nativeEvent.layout.width)}
        >
          <View style={styles.progressBarBackground}>
            <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
          </View>
        </TouchableOpacity>
        <View style={styles.timeRow}>
          <ThemedText style={styles.timeText}>{formatTime(position)}</ThemedText>
          <ThemedText style={styles.timeText}>{formatTime(duration)}</ThemedText>
        </View>
      </View>

      {/* Transport Controls */}
      <View style={styles.controlsContainer}>
        <ControlRow compact={true} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Premium.background,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five,
    gap: Spacing.three,
    paddingBottom: TabBottomReservation,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 56,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  likeButton: {
    padding: 8,
    borderRadius: 8,
  },
  likeIcon: {
    width: 24,
    height: 24,
  },
  artworkContainer: {
    alignItems: 'center',
  },
  metaContainer: {
    alignItems: 'center',
    gap: 4,
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
    gap: 2,
  },
  seekTouchable: {
    width: '100%',
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressBarBackground: {
    width: '100%',
    height: 4,
    backgroundColor: Premium.divider,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Premium.accent,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    fontSize: 12,
    color: Premium.textSecondary,
  },
  controlsContainer: {
    marginTop: Spacing.two,
  },
});
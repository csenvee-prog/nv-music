import React from 'react';
import { View, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { usePlayerStore } from '@/store/player';
import { useLikesStore } from '@/store/likes';
import { ThemedText } from '@/components/themed-text';
import { MiniPlayerHeight, Premium, Spacing } from '@/constants/theme';
import { router } from 'expo-router';

// Heart icon for like button
const HeartIcon = ({ liked }: { liked: boolean }) => (
  <Image
    source={require('@/assets/icons/heart_like_icon.png')}
    style={styles.heartIcon}
    tintColor={liked ? Premium.accent : Premium.textSecondary}
    resizeMode="contain"
  />
);

export function MiniPlayer() {
  const { currentTrack, isPlaying, togglePlay, prev, next, position, duration, seek } = usePlayerStore();
  const { isLiked, likeTrack, unlikeTrack } = useLikesStore();
  const [progressBarWidth, setProgressBarWidth] = React.useState(0);

  const handleLike = () => {
    if (currentTrack) {
      if (isLiked(currentTrack.id)) {
        unlikeTrack(currentTrack.id);
      } else {
        likeTrack(currentTrack.id);
      }
    }
  };

  const handleNavigate = () => {
    router.push('/nowplaying');
  };

  const handleSeekBarPress = async (evt: any) => {
    if (duration <= 0 || progressBarWidth <= 0) return;

    const { locationX } = evt.nativeEvent;
    const progressRatio = Math.max(0, Math.min(1, locationX / progressBarWidth));
    const targetSeconds = progressRatio * duration;

    await seek(targetSeconds);
  };

  if (!currentTrack) return null;

  const progress = duration > 0 ? position / duration : 0;
  const progressPercent = Math.max(0, Math.min(1, progress)) * 100;

  return (
    <View style={styles.container}>
      {/* Top Row: Artwork, Track Info, Playback Controls */}
      <View style={styles.topRow}>
        {/* Album Artwork */}
        <TouchableOpacity style={styles.artworkContainer} onPress={handleNavigate} activeOpacity={0.7}>
          {currentTrack.artworkUrl ? (
            <Image source={{ uri: currentTrack.artworkUrl }} style={styles.artwork} resizeMode="cover" />
          ) : (
            <Image source={require('@/assets/icons/music-note.png')} style={styles.artworkPlaceholder} tintColor={Premium.artworkTint} resizeMode="contain" />
          )}
        </TouchableOpacity>

        {/* Track Info */}
        <View style={styles.trackInfo}>
          <TouchableOpacity style={styles.trackTouchable} onPress={handleNavigate} activeOpacity={0.7}>
            <ThemedText style={styles.title} numberOfLines={1} ellipsizeMode="tail">
              {currentTrack.title}
            </ThemedText>
            <ThemedText style={styles.artist} numberOfLines={1} ellipsizeMode="tail">
              {currentTrack.artist}
            </ThemedText>
          </TouchableOpacity>
        </View>

        {/* Playback Controls */}
        <View style={styles.controlsContainer}>
          <TouchableOpacity style={styles.controlButton} onPress={prev} activeOpacity={0.7}>
            <Image source={require('@/assets/icons/skip_previous_icon.png')} style={styles.controlIcon} tintColor={Premium.text} resizeMode="contain" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.playButton} onPress={togglePlay} activeOpacity={0.8}>
            <Image
              source={isPlaying ? require('@/assets/icons/pause.png') : require('@/assets/icons/play.png')}
              style={styles.playIcon}
              tintColor={Premium.accentForeground}
              resizeMode="contain"
            />
          </TouchableOpacity>

          <TouchableOpacity style={styles.controlButton} onPress={next} activeOpacity={0.7}>
            <Image source={require('@/assets/icons/skip_next_icon.png')} style={styles.controlIcon} tintColor={Premium.text} resizeMode="contain" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.likeButton} onPress={handleLike} activeOpacity={0.7}>
            <HeartIcon liked={isLiked(currentTrack.id)} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Progress Bar */}
      <View style={styles.bottomRow}>
        <TouchableOpacity
          style={styles.seekTouchable}
          activeOpacity={1}
          onPress={handleSeekBarPress}
          onLayout={(event) => setProgressBarWidth(event.nativeEvent.layout.width)}
        >
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
          </View>
        </TouchableOpacity>
        <View style={styles.timeRow}>
          <ThemedText style={styles.timeText}>{formatTime(position)}</ThemedText>
          <ThemedText style={styles.timeText}>{formatTime(duration)}</ThemedText>
        </View>
      </View>
    </View>
  );
}

// Format time in M:SS format
function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: MiniPlayerHeight,
    bottom: 0,
    backgroundColor: Premium.surfaceHigh,
    borderTopWidth: 1,
    borderTopColor: Premium.divider,
    paddingHorizontal: Spacing.four,
    justifyContent: 'center',
    pointerEvents: 'box-none', // Allow touches to pass through to tab bar
  },
  topRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  artworkContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Premium.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  artwork: {
    width: 36,
    height: 36,
  },
  artworkPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  trackInfo: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackTouchable: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: Premium.text,
    textAlign: 'center',
  },
  artist: {
    fontSize: 11,
    color: Premium.textSecondary,
    marginTop: 2,
  },
  controlsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  controlButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Premium.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    width: 14,
    height: 14,
  },
  controlIcon: {
    width: 20,
    height: 20,
  },
  likeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heartIcon: {
    width: 18,
    height: 18,
  },
  seekTouchable: {
    flex: 1,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  progressBar: {
    width: '100%',
    height: 4,
    backgroundColor: Premium.divider,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Premium.accent,
  },
  timeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  timeText: {
    fontSize: 11,
    color: Premium.textSecondary,
  },
});
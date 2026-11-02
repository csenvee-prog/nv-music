/**
 * Liked Songs Screen - Shows all tracks the user has liked
 */

import { StyleSheet, View, TouchableOpacity, Image, FlatList } from 'react-native';
import { useEffect, useState } from 'react';
import { ThemedText } from '@/components/themed-text';
import { Premium, Spacing, ContentBottomPadding } from '@/constants/theme';
import { getAllTracks } from '@/services/sources';
import { useLikesStore } from '@/store/likes';
import { usePlayerStore } from '@/store/player';
import { Track } from '@/types/music';
import { MiniPlayer } from '@/components/player/mini-player';

export default function LikedSongsScreen() {
  const { likedTrackIds } = useLikesStore();
  const { playTrack } = usePlayerStore();
  const [allTracks, setAllTracks] = useState<Track[]>([]);

  // Load all tracks from all sources once
  useEffect(() => {
    getAllTracks().then(setAllTracks);
  }, []);

  // Build a lookup map for O(1) track resolution
  const trackMap = new Map(allTracks.map(t => [t.id, t]));

  // Get all liked tracks by resolving IDs against all available tracks
  const likedTracks = Array.from(likedTrackIds)
    .map(id => trackMap.get(id))
    .filter((track): track is Track => track !== undefined);

  const handlePlayTrack = async (track: Track) => {
    await playTrack(track, likedTracks);
  };

  const renderTrack = ({ item }: { item: Track }) => (
    <TouchableOpacity style={styles.trackRow} onPress={() => handlePlayTrack(item)}>
      <View style={styles.artworkContainer}>
        {item.artworkUrl ? (
          <Image source={{ uri: item.artworkUrl }} style={styles.artwork} resizeMode="cover" />
        ) : (
          <Image source={require('@/assets/icons/music-note.png')} style={styles.artworkPlaceholder} tintColor={Premium.artworkTint} />
        )}
      </View>

      <View style={styles.trackInfo}>
        <ThemedText style={styles.trackTitle} numberOfLines={1}>{item.title}</ThemedText>
        <ThemedText style={styles.trackArtist} numberOfLines={1}>{item.artist}</ThemedText>
      </View>

      <View style={styles.playContainer}>
        <Image
          source={require('@/assets/icons/play.png')}
          style={styles.playIcon}
          tintColor={Premium.accent}
          resizeMode="contain"
        />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <ThemedText style={styles.header}>Liked Songs</ThemedText>
        <ThemedText style={styles.count}>{likedTracks.length}</ThemedText>
      </View>

      {likedTracks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Image
            source={require('@/assets/icons/library.png')}
            style={styles.emptyIcon}
            tintColor={Premium.textSecondary}
          />
          <ThemedText style={styles.emptyTitle}>No liked songs yet</ThemedText>
          <ThemedText style={styles.emptyDesc} themeColor="textSecondary">
            Tap the heart icon on tracks to add them to your library.
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={likedTracks}
          renderItem={renderTrack}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        />
      )}
      <MiniPlayer />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Premium.background,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five,
    paddingBottom: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: Premium.divider,
  },
  header: {
    fontSize: 24,
    fontWeight: '700',
  },
  count: {
    fontSize: 16,
    color: Premium.textSecondary,
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: ContentBottomPadding,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    gap: Spacing.four,
    borderBottomWidth: 1,
    borderBottomColor: Premium.divider,
  },
  artworkContainer: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: Premium.surfaceElevated,
    overflow: 'hidden',
  },
  artwork: {
    width: 56,
    height: 56,
  },
  artworkPlaceholder: {
    width: 56,
    height: 56,
  },
  trackInfo: {
    flex: 1,
  },
  trackTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  trackArtist: {
    fontSize: 14,
    color: Premium.textSecondary,
    marginTop: 2,
  },
  playContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Premium.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    width: 16,
    height: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingHorizontal: Spacing.four,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    opacity: 0.5,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: Spacing.four,
  },
  emptyDesc: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: Spacing.two,
  },
});
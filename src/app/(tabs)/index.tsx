/**
 * Home Screen - NV Music
 * Clean Apple Music-inspired layout with real playback tracking
 */

import { ScrollView, StyleSheet, View, Pressable, Image, TouchableOpacity } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Premium, Spacing, ContentBottomPadding, CardSize } from '@/constants/theme';
import { SEED_ALBUMS, SEED_TRACKS } from '@/data/seed';
import { usePlayerStore } from '@/store/player';
import { useLikesStore } from '@/store/likes';
import { Track } from '@/types/music';
import { router } from 'expo-router';
import { MiniPlayer } from '@/components/player/mini-player';

// Simple heart icon - we'll use color to indicate liked status
const HeartIcon = ({ liked }: { liked: boolean }) => (
  <Image
    source={require('@/assets/icons/heart_like_icon.png')}
    style={styles.heartIcon}
    tintColor={liked ? Premium.accent : Premium.textSecondary}
    resizeMode="contain"
  />
);

export default function HomeScreen() {
  const { currentTrack, playTrack, recentHistory } = usePlayerStore();
  const { isLiked, likeTrack, unlikeTrack } = useLikesStore();

  // Build recently played from separate playback history (independent of queue)
  const recentTracks = recentHistory.slice(0, 4);
  const uniqueTracks = currentTrack
    ? [currentTrack, ...recentTracks].filter((t, i, arr) => arr.findIndex(tr => tr.id === t.id) === i).slice(0, 4)
    : recentTracks;

  const handlePlayTrack = (track: Track) => {
    // Use the full Track object directly from recentHistory
    // Build queue from all available tracks across sources
    const allTracks = [
      ...Object.values(SEED_TRACKS),
      ...recentHistory,
    ];
    // Deduplicate by ID
    const queue = Array.from(
      new Map(allTracks.map(t => [t.id, t])).values()
    );
    playTrack(track, queue);
    router.push('/nowplaying');
  };

  const handlePlayAlbum = (trackIds: string[]) => {
    if (trackIds.length > 0) {
      const tracks = trackIds
        .map(id => SEED_TRACKS[id])
        .filter(Boolean);
      if (tracks.length > 0) {
        playTrack(tracks[0], tracks);
        router.push('/nowplaying');
      }
    }
  };

  const handleLike = (trackId: string) => {
    if (isLiked(trackId)) {
      unlikeTrack(trackId);
    } else {
      likeTrack(trackId);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <ThemedText style={styles.greeting}>Good morning</ThemedText>
        </View>

        {/* Recently Played - uses ACTUAL playback data */}
        {uniqueTracks.length > 0 && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Recently Played</ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
              {uniqueTracks.map(track => (
                <Pressable
                  key={track.id}
                  style={({ pressed }) => [styles.trackCard, pressed && styles.cardPressed]}
                  onPress={() => handlePlayTrack(track)}
                >
                  <View style={styles.artworkPlaceholder}>
                    {track.artworkUrl ? (
                    <Image source={{ uri: track.artworkUrl }} style={styles.artwork} resizeMode="cover" />
                  ) : (
                    <Image source={require('@/assets/icons/music-note.png')} style={styles.artworkPlaceholderIcon} tintColor={Premium.artworkTint} />
                  )}
                </View>
                <View style={styles.trackInfo}>
                  <TouchableOpacity onPress={() => handlePlayTrack(track)}>
                    <ThemedText style={styles.trackTitle} numberOfLines={1}>{track.title}</ThemedText>
                    <ThemedText style={styles.trackArtist} numberOfLines={1}>{track.artist}</ThemedText>
                  </TouchableOpacity>
                </View>
                <Pressable style={styles.likeButton} onPress={(e) => { e.stopPropagation(); handleLike(track.id); }}>
                  <HeartIcon liked={isLiked(track.id)} />
                </Pressable>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Liked Songs - navigate to library page */}
      <TouchableOpacity
        style={styles.playlistCard}
        onPress={() => router.push('/liked-songs')}
      >
        <View style={styles.playlistArtwork}>
          <Image source={require('@/assets/icons/heart_like_icon.png')} style={styles.playlistIcon} />
        </View>
        <ThemedText style={styles.playlistTitle}>Liked Songs</ThemedText>
        <ThemedText style={styles.playlistDesc} themeColor="textSecondary">
          {Object.keys(SEED_TRACKS).filter(id => isLiked(id)).length} tracks
        </ThemedText>
      </TouchableOpacity>

      {/* Recently Added Albums */}
      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Albums</ThemedText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
          {SEED_ALBUMS.map(album => (
            <Pressable
              key={album.id}
              style={({ pressed }) => [styles.albumCard, pressed && styles.cardPressed]}
              onPress={() => handlePlayAlbum(album.trackIds)}
            >
              <View style={styles.albumArtwork}>
                {album.artworkUrl ? (
                  <Image source={{ uri: album.artworkUrl }} style={styles.albumArtworkImg} resizeMode="cover" />
                ) : (
                  <Image source={require('@/assets/icons/music-note.png')} style={styles.albumPlaceholderIcon} tintColor={Premium.artworkTint} />
                )}
              </View>
              <ThemedText style={styles.albumTitle} numberOfLines={1}>{album.title}</ThemedText>
              <ThemedText style={styles.albumArtist} numberOfLines={1}>{album.artist}</ThemedText>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      </ScrollView>
      {/* MiniPlayer positioned above tab bar */}
      <MiniPlayer />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Premium.background,
    position: 'relative',
  },
  scrollContainer: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five,
    paddingBottom: ContentBottomPadding,
    gap: Spacing.five,
  },
  header: {
    marginBottom: Spacing.two,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '700',
  },
  section: {
    gap: Spacing.two,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '600',
  },
  horizontalScroll: {
    gap: Spacing.four,
  },

  // Track Card
  trackCard: {
    alignItems: 'center',
    width: CardSize.track,
    gap: Spacing.one,
    marginRight: Spacing.four,
    paddingBottom: Spacing.two,
  },
  cardPressed: {
    opacity: 0.7,
  },
  artworkPlaceholder: {
    width: CardSize.track,
    height: CardSize.track,
    borderRadius: 12,
    backgroundColor: Premium.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  artwork: {
    width: '100%',
    height: '100%',
  },
  artworkPlaceholderIcon: {
    width: 48,
    height: 48,
  },
  trackInfo: {
    alignItems: 'center',
    width: '100%',
    gap: Spacing.half,
  },
  trackTitle: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  trackArtist: {
    fontSize: 12,
    color: Premium.textSecondary,
  },
  likeButton: {
    padding: 4,
    borderRadius: 20,
  },
  heartIcon: {
    width: 20,
    height: 20,
  },

  // Playlist Card
  playlistCard: {
    width: '100%',
    marginBottom: Spacing.three,
    gap: Spacing.one,
  },
  playlistArtwork: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: Premium.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  playlistIcon: {
    width: 48,
    height: 48,
    opacity: 0.6,
  },
  playlistTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  playlistDesc: {
    fontSize: 12,
    color: Premium.textSecondary,
  },

  // Album Card
  albumCard: {
    alignItems: 'center',
    width: CardSize.track,
    gap: Spacing.half,
    marginRight: Spacing.four,
  },
  albumArtwork: {
    width: CardSize.track,
    height: CardSize.track,
    borderRadius: 12,
    backgroundColor: Premium.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  albumArtworkImg: {
    width: '100%',
    height: '100%',
  },
  albumPlaceholderIcon: {
    width: 48,
    height: 48,
  },
  albumTitle: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  albumArtist: {
    fontSize: 12,
    color: Premium.textSecondary,
  },
});
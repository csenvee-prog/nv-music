import { useState, useEffect } from 'react';
import { ScrollView, StyleSheet, TextInput, View, TouchableOpacity, Image } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Premium, Spacing, ContentBottomPadding } from '@/constants/theme';
import { localSourceAdapter } from '@/services/sources/local';
import { Track } from '@/types/music';
import { usePlayerStore } from '@/store/player';
import { router } from 'expo-router';
import { MiniPlayer } from '@/components/player/mini-player';

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [tracks, setTracks] = useState<Track[]>([]);
  const { playTrack } = usePlayerStore();

  useEffect(() => {
    localSourceAdapter.getTracks().then(setTracks).catch(() => {});
  }, []);

  const filtered = tracks.filter(t =>
    t.title.toLowerCase().includes(query.toLowerCase()) ||
    t.artist.toLowerCase().includes(query.toLowerCase())
  );

  const handlePlayTrack = async (track: Track) => {
    await playTrack(track, filtered);
    router.push('/nowplaying');
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerContainer}>
          <ThemedText style={styles.header}>Search</ThemedText>
        </View>

        <View style={styles.searchBarContainer}>
          <View style={styles.searchBar}>
            <Image
              source={require('@/assets/icons/search.png')}
              style={styles.searchIcon}
              tintColor={Premium.textSecondary}
            />
            <TextInput
              style={styles.input}
              placeholder="Search local tracks..."
              placeholderTextColor={Premium.textSecondary}
              value={query}
              onChangeText={setQuery}
            />
          </View>
        </View>

        {query.length > 0 && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Results ({filtered.length})</ThemedText>
            {filtered.length === 0 ? (
              <ThemedText themeColor="textSecondary">No matching tracks found.</ThemedText>
            ) : (
              filtered.map(track => (
                <TouchableOpacity key={track.id} style={styles.trackRow} onPress={() => handlePlayTrack(track)}>
                  <View style={styles.trackArt} />
                  <View style={styles.trackInfo}>
                    <ThemedText style={styles.trackTitle} numberOfLines={1}>{track.title}</ThemedText>
                    <ThemedText style={styles.trackArtist} numberOfLines={1}>{track.artist}</ThemedText>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}
      </ScrollView>
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
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five,
    paddingBottom: ContentBottomPadding,
    gap: Spacing.four,
  },
  headerContainer: {
    marginBottom: Spacing.two,
  },
  header: {
    fontSize: 24,
    fontWeight: '700',
  },
  searchBarContainer: {
    marginTop: Spacing.two,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Premium.surface,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    color: Premium.text,
    fontSize: 16,
  },
  section: {
    gap: Spacing.two,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.one,
  },
  trackArt: {
    width: 48,
    height: 48,
    borderRadius: Spacing.half,
    backgroundColor: Premium.surfaceElevated,
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
  },
  searchIcon: {
    width: 18,
    height: 18,
  },
});
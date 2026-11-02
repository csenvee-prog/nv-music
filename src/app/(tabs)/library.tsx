import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View, TouchableOpacity, ActivityIndicator, Alert, Image } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Premium, Spacing, ContentBottomPadding } from '@/constants/theme';
import { localSourceAdapter } from '@/services/sources/local';
import { Track } from '@/types/music';
import { usePlayerStore } from '@/store/player';
import { MiniPlayer } from '@/components/player/mini-player';

export default function LibraryScreen() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [permissionState, setPermissionState] = useState<string>('undetermined');
  const [loading, setLoading] = useState(false);
  const { playTrack, error, clearError } = usePlayerStore();

  useEffect(() => {
    if (error) {
      Alert.alert('Playback Error', error, [{ text: 'OK', onPress: clearError }]);
    }
  }, [error, clearError]);

  const loadLocalMusic = async () => {
    setLoading(true);
    const state = await localSourceAdapter.getPermissionState();
    setPermissionState(state);

    if (state === 'granted') {
      const fetched = await localSourceAdapter.getTracks();
      setTracks(fetched);
    }
    setLoading(false);
  };

  const handleRequestPermission = async () => {
    const newState = await localSourceAdapter.requestPermission();
    setPermissionState(newState);
    if (newState === 'granted') {
      loadLocalMusic();
    }
  };

  const handlePlayTrack = async (track: Track) => {
    // Play the track - do NOT navigate to nowplaying
    // User can tap the mini-player to see Now Playing
    await playTrack(track, tracks);
  };

  useEffect(() => {
    // Wrap in a function to avoid direct setState in effect
    const init = async () => {
      await loadLocalMusic();
    };
    init();
  }, []);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerContainer}>
          <ThemedText style={styles.header}>Your Library</ThemedText>
        </View>

        {permissionState !== 'granted' ? (
          <View style={styles.permissionCard}>
            <Image
              source={require('@/assets/icons/library.png')}
              style={styles.permissionIcon}
            />
            <ThemedText style={styles.permissionTitle}>Access Local Music</ThemedText>
            <ThemedText style={styles.permissionDesc} themeColor="textSecondary">
              NV Music needs permission to scan your device&apos;s local audio library.
            </ThemedText>
            <TouchableOpacity style={styles.button} onPress={handleRequestPermission}>
              <ThemedText style={styles.buttonText}>Grant Permission</ThemedText>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Local Music ({tracks.length})</ThemedText>
            {loading ? (
              <ActivityIndicator color={Premium.accent} style={{ marginTop: Spacing.four }} />
            ) : tracks.length === 0 ? (
              <ThemedText themeColor="textSecondary">No local audio files found on device.</ThemedText>
            ) : (
              tracks.map(track => (
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
  permissionCard: {
    backgroundColor: Premium.surface,
    padding: Spacing.four,
    borderRadius: Spacing.three,
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.five,
  },
  permissionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  permissionDesc: {
    fontSize: 14,
    textAlign: 'center',
  },
  button: {
    backgroundColor: Premium.accent,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.five,
    marginTop: Spacing.one,
  },
  buttonText: {
    color: Premium.accentForeground,
    fontWeight: '600',
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
  permissionIcon: {
    width: 32,
    height: 32,
    tintColor: Premium.accent,
  },
});
import { ScrollView, StyleSheet, View, Pressable, FlatList } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Premium, Spacing } from '@/constants/theme';
import { SOURCES } from '@/services/sources';
import { SEED_TRACKS, DEMO_TRACKS } from '@/data/seed';
import { usePlayerStore } from '@/store/player';
import { router } from 'expo-router';

export default function ExploreScreen() {
  const { playTrack } = usePlayerStore();

  const handlePlayDemoTrack = async (trackId: string) => {
    const track = SEED_TRACKS[trackId];
    if (track) {
      // Build queue from demo tracks
      const queue = Object.values(SEED_TRACKS);
      await playTrack(track, queue);
      router.push('/nowplaying');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ThemedText style={styles.header}>Explore & Sources</ThemedText>

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Available Music Sources</ThemedText>
        {SOURCES.map(source => (
          <View key={source.id} style={styles.sourceCard}>
            <View style={styles.sourceInfo}>
              <ThemedText style={styles.sourceName}>{source.name}</ThemedText>
              <ThemedText style={styles.sourceType} themeColor="textSecondary">
                {source.type.toUpperCase()} {source.requiresPermission ? '• Requires Permission' : ''}
              </ThemedText>
            </View>
            <View style={styles.badge}>
              <ThemedText style={styles.badgeText}>Active</ThemedText>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Genres & Moods</ThemedText>
        <View style={styles.grid}>
          {['Ambient', 'Electronic', 'Lo-Fi', 'Classical', 'Rock', 'Jazz'].map(genre => (
            <Pressable
              key={genre}
              style={({ pressed }) => [styles.genreCard, pressed && { opacity: 0.8 }]}
              onPress={() => {
                // For now, just show a toast or navigate
              }}
            >
              <ThemedText style={styles.genreText}>{genre}</ThemedText>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Demo Tracks</ThemedText>
        <FlatList
          data={DEMO_TRACKS}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: Spacing.three }}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.demoCard, pressed && { opacity: 0.8 }]}
              onPress={() => handlePlayDemoTrack(item.id)}
            >
              <View style={styles.demoArtwork} />
              <ThemedText style={styles.demoTitle} numberOfLines={2}>{item.title}</ThemedText>
              <ThemedText style={styles.demoArtist} numberOfLines={1}>{item.artist}</ThemedText>
            </Pressable>
          )}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Premium.background,
  },
  content: {
    padding: Spacing.four,
    paddingBottom: 120,
    gap: Spacing.four,
  },
  header: {
    fontSize: 24,
    fontWeight: '700',
  },
  section: {
    gap: Spacing.two,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  sourceCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Premium.surface,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  sourceInfo: {
    gap: Spacing.half,
  },
  sourceName: {
    fontSize: 16,
    fontWeight: '600',
  },
  sourceType: {
    fontSize: 12,
  },
  badge: {
    backgroundColor: Premium.surfaceElevated,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Spacing.half,
  },
  badgeText: {
    fontSize: 12,
    color: Premium.accent,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  genreCard: {
    width: '48%',
    backgroundColor: Premium.surface,
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    alignItems: 'center',
  },
  genreText: {
    fontSize: 16,
    fontWeight: '600',
  },
  demoCard: {
    width: 120,
    alignItems: 'center',
    backgroundColor: Premium.surface,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  demoArtwork: {
    width: 120,
    height: 120,
    borderRadius: Spacing.two,
    backgroundColor: Premium.surfaceElevated,
    marginBottom: Spacing.two,
  },
  demoTitle: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: Spacing.one,
    textAlign: 'center',
  },
  demoArtist: {
    fontSize: 12,
    color: Premium.textSecondary,
    textAlign: 'center',
  },
});

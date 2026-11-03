/**
 * Settings Screen - NV Music
 * Application settings and third-party service connections
 */

import { StyleSheet, View, Pressable, ActivityIndicator, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Premium, Spacing } from '@/constants/theme';
import { getSupabase } from '@/services/supabase';
import { initiateSpotifyOAuth, isSpotifyConfigured } from '@/services/spotify-oauth';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';

interface ConnectionStatus {
  connected: boolean;
  loading: boolean;
  error: string | null;
}

export default function SettingsScreen() {
  const [spotifyStatus, setSpotifyStatus] = useState<ConnectionStatus>({
    connected: false,
    loading: true,
    error: null,
  });
  const [disconnecting, setDisconnecting] = useState(false);
  const isMountedRef = useRef(true);

  // Check Spotify connection status on mount
  useEffect(() => {
    const checkSpotifyConnectionStatus = async () => {
      const supabase = getSupabase();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        if (isMountedRef.current) {
          setSpotifyStatus({ connected: false, loading: false, error: null });
        }
        return;
      }

      try {
        setSpotifyStatus(prev => ({ ...prev, loading: true }));
        const response = await fetch(
          `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/spotify-connection-status`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch connection status');
        }

        const data = await response.json() as { connected: boolean };
        if (isMountedRef.current) {
          setSpotifyStatus({ connected: data.connected, loading: false, error: null });
        }
      } catch (error) {
        if (isMountedRef.current) {
          setSpotifyStatus({
            connected: false,
            loading: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    };

    checkSpotifyConnectionStatus();

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Refresh connection status after OAuth callback
  const refreshConnectionStatus = useCallback(async () => {
    const supabase = getSupabase();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setSpotifyStatus({ connected: false, loading: false, error: null });
      return;
    }

    try {
      setSpotifyStatus(prev => ({ ...prev, loading: true }));
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/spotify-connection-status`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch connection status');
      }

      const data = await response.json() as { connected: boolean };
      setSpotifyStatus({ connected: data.connected, loading: false, error: null });
    } catch (error) {
      setSpotifyStatus({
        connected: false,
        loading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, []);

  // Refresh connection status when screen regains focus
  // This handles returning from OAuth callbacks and other navigation
  useFocusEffect(
    useCallback(() => {
      refreshConnectionStatus();
    }, [refreshConnectionStatus])
  );

  const handleConnectSpotify = async () => {
    if (!isSpotifyConfigured()) {
      Alert.alert('Spotify Not Configured', 'Spotify OAuth is not configured. Set EXPO_PUBLIC_SPOTIFY_CLIENT_ID in your environment.');
      return;
    }

    // Prevent double-tap from starting competing OAuth sessions
    if (spotifyStatus.loading) {
      return;
    }

    try {
      setSpotifyStatus(prev => ({ ...prev, loading: true, error: null }));
      const result = await initiateSpotifyOAuth();

      // OAuth succeeded - refresh status from backend
      await refreshConnectionStatus();

      if (result?.success) {
        // Only show success if backend confirms connection exists
        if (spotifyStatus.connected) {
          Alert.alert('Connected!', 'Spotify has been connected to your account.');
        } else {
          // Token exchange succeeded but backend doesn't have connection
          // This shouldn't happen normally, but handle gracefully
          setSpotifyStatus(prev => ({ ...prev, error: 'Connection status verification failed' }));
          Alert.alert('Connection Failed', 'Could not verify Spotify connection. Please try again.');
        }
      } else {
        // User cancelled - already reset by error handler above (no exception thrown)
        setSpotifyStatus(prev => ({ ...prev, loading: false, error: null }));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setSpotifyStatus(prev => ({ ...prev, loading: false, error: errorMessage }));
      Alert.alert('Connection Failed', errorMessage);
    }
  };

  const handleDisconnectSpotify = async () => {
    const supabase = getSupabase();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.access_token) {
      Alert.alert('Not Logged In', 'You must be logged in to disconnect Spotify.');
      return;
    }

    Alert.alert(
      'Disconnect Spotify?',
      'This will remove your Spotify connection from NV Music. Your playlists and liked songs will not be deleted.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            setDisconnecting(true);
            try {
              const response = await fetch(
                `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/spotify-disconnect`,
                {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                  },
                }
              );

              if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to disconnect');
              }

              // Only update status on success
              setSpotifyStatus({ connected: false, loading: false, error: null });
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              Alert.alert('Disconnect Failed', errorMessage);
              // Preserve the existing connection state on failure
            } finally {
              setDisconnecting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <ThemedText style={styles.title}>Settings</ThemedText>
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Account</ThemedText>

          {/* Spotify Connection */}
          <View style={styles.settingCard}>
            <View style={styles.connectionHeader}>
              <ThemedText style={styles.connectionTitle}>Spotify</ThemedText>
              {spotifyStatus.loading ? (
                <ActivityIndicator size="small" color={Premium.accent} />
              ) : spotifyStatus.connected ? (
                <View style={styles.connectedBadge}>
                  <ThemedText style={styles.connectedText}>Connected</ThemedText>
                </View>
              ) : (
                <ThemedText style={styles.statusText}>Not Connected</ThemedText>
              )}
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.connectButton,
                spotifyStatus.loading && styles.connectButtonDisabled,
                (disconnecting || spotifyStatus.loading) && styles.connectButtonDisabled,
                pressed && !disconnecting && !spotifyStatus.loading && styles.connectButtonPressed,
              ]}
              onPress={spotifyStatus.connected ? handleDisconnectSpotify : handleConnectSpotify}
              disabled={spotifyStatus.loading || disconnecting}
            >
              {disconnecting ? (
                <ActivityIndicator size="small" color={Premium.background} />
              ) : spotifyStatus.connected ? (
                <ThemedText style={styles.disconnectButtonText}>Disconnect</ThemedText>
              ) : (
                <ThemedText style={styles.connectButtonText}>Connect</ThemedText>
              )}
            </Pressable>

            {spotifyStatus.error && (
              <View style={styles.errorContainer}>
                <ThemedText style={styles.errorText}>Error: {spotifyStatus.error}</ThemedText>
                <TouchableOpacity onPress={refreshConnectionStatus}>
                  <ThemedText style={styles.retryText}>Retry</ThemedText>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* App Section */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>App</ThemedText>

          {/* Theme Settings placeholder - tap to change */}
          <TouchableOpacity style={styles.settingCard}>
            <ThemedText style={styles.sectionTitle}>Theme</ThemedText>
            <ThemedText style={styles.settingSubtitle}>System Default</ThemedText>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Premium.background,
  },
  scrollContainer: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five,
    paddingBottom: Spacing.five,
    gap: Spacing.five,
  },
  header: {
    marginBottom: Spacing.two,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  section: {
    gap: Spacing.three,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Premium.textTertiary,
  },
  settingSubtitle: {
    fontSize: 14,
    color: Premium.textSecondary,
    marginTop: Spacing.half,
  },
  settingCard: {
    backgroundColor: Premium.surfaceElevated,
    borderRadius: 12,
    padding: Spacing.four,
  },
  connectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.four,
  },
  connectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  statusText: {
    fontSize: 14,
    color: Premium.textSecondary,
  },
  connectedBadge: {
    backgroundColor: Premium.accent,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  connectedText: {
    fontSize: 12,
    fontWeight: '600',
    color: Premium.background,
  },
  connectButton: {
    backgroundColor: Premium.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  connectButtonPressed: {
    opacity: 0.8,
  },
  connectButtonDisabled: {
    backgroundColor: Premium.textTertiary,
  },
  connectButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Premium.background,
  },
  disconnectButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Premium.text,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.two,
  },
  errorText: {
    fontSize: 12,
    color: '#ff4d4d',
    flex: 1,
  },
  retryText: {
    fontSize: 12,
    color: Premium.accent,
    fontWeight: '600',
  },
});
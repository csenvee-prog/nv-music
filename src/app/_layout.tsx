import { DarkTheme, DefaultTheme, ThemeProvider, router } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import { useColorScheme, StyleSheet, View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useState, useRef, useCallback } from 'react';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { usePlayerStore } from '@/store/player';
import { processCallback, isSpotifyCallbackUrl } from '@/services/spotify-oauth';

SplashScreen.preventAutoHideAsync();

/**
 * OAuth Callback Handler
 * Handles deep links from Spotify OAuth callback when the app is launched or already open.
 *
 * Callback flow:
 * 1. Cold-start (app launched via callback URL): processCallback() handles it here
 *    - initiateSpotifyOAuth() already completed via browser, so we just process
 * 2. Runtime Linking event (app already open): processCallback() handles it
 *    - Same as cold-start: initiateSpotifyOAuth() already completed via browser
 */
function OAuthCallbackHandler({ children }: { children: React.ReactNode }) {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // use ref to prevent duplicate processing - React state is async
  const processingRef = useRef(false);
  const processedUrlRef = useRef<string | null>(null);

  const handleCallback = useCallback(async (url: string) => {
    // Prevent duplicate processing using ref
    if (processingRef.current) {
      return;
    }

    // Prevent processing the same URL twice (handles race between getInitialURL and event listener)
    if (processedUrlRef.current === url) {
      return;
    }

    processingRef.current = true;
    processedUrlRef.current = url;

    setProcessing(true);
    setError(null);

    try {
      const result = await processCallback(url);
      if (result === true) {
        // Success - hide splash screen and navigate to Settings screen
        SplashScreen.hideAsync();
        // Navigate to Settings to show updated Spotify connection status
        router.push('/(tabs)/settings');
      } else if (result === 'cancelled') {
        // User cancelled - just hide splash screen, stay on current screen
        SplashScreen.hideAsync();
      } else {
        // Not a Spotify callback or no code - hide splash screen
        SplashScreen.hideAsync();
      }
      // Reset processing state after success, cancelled, or not a callback
      setProcessing(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      setProcessing(false);
      SplashScreen.hideAsync();
    } finally {
      // Always reset the processing ref, regardless of outcome
      // This allows future callbacks to be processed after the component is mounted
      processingRef.current = false;
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const processInitialUrl = async () => {
      const url = await Linking.getInitialURL();
      if (url && isSpotifyCallbackUrl(url)) {
        if (isMounted) {
          await handleCallback(url);
        }
      } else if (isMounted) {
        // Not a Spotify callback URL, hide splash screen
        SplashScreen.hideAsync();
      }
    };

    processInitialUrl();

    // Listen for incoming links when app is already open
    const subscription = Linking.addEventListener('url', ({ url }) => {
      // Only process Spotify callback URLs
      if (isSpotifyCallbackUrl(url)) {
        handleCallback(url);
      }
    });

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, [handleCallback]);

  // Keep children mounted during processing - show loading overlay on top
  return (
    <>
      {children}
      {processing && (
        <View style={styles.processingOverlay}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#208AEF" />
          </View>
        </View>
      )}
      {error && (
        <View style={styles.processingOverlay}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#ff3b30" />
          </View>
        </View>
      )}
    </>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const initStore = usePlayerStore(state => state.init);

  useEffect(() => {
    const unsubscribe = initStore();
    return () => unsubscribe();
  }, [initStore]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SafeAreaView style={styles.safeArea}>
        <AnimatedSplashOverlay />
        <OAuthCallbackHandler>
          <Stack
            screenOptions={{
              headerShown: false,
            }}
          >
            {/* Tabs routes */}
            <Stack.Screen name="(tabs)" />
            {/* Now Playing - separate screen from tabs */}
            <Stack.Screen
              name="nowplaying"
              options={{
                gestureEnabled: false, // Prevent swipe back from hardware
              }}
            />
          </Stack>
        </OAuthCallbackHandler>
      </SafeAreaView>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    backgroundColor: '#121212',
    padding: 20,
    borderRadius: 12,
  },
});
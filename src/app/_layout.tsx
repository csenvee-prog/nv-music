import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect } from 'react';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { usePlayerStore } from '@/store/player';

SplashScreen.preventAutoHideAsync();

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
      </SafeAreaView>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
});
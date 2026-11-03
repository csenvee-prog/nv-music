/**
 * Zustand Player Store.
 *
 * The single source of truth for NV Music's playback state.
 *
 * It coordinates between the audio engine (audioService), the music
 * sources (services/sources), and the React UI.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { audioService } from '@/services/audio';
import { Track, RepeatMode } from '@/types/music';

// Storage adapter for web (localStorage - synchronous)
const webStorage = createJSONStorage<Record<string, any>>(() => ({
  getItem: (name: string): string | null => {
    try {
      return localStorage.getItem(name);
    } catch (error) {
      console.error('[PlayerStore] Failed to read from localStorage:', error);
      return null;
    }
  },
  setItem: (name: string, value: string): void => {
    try {
      localStorage.setItem(name, value);
    } catch (error) {
      console.error('[PlayerStore] Failed to write to localStorage:', error);
    }
  },
  removeItem: (name: string): void => {
    try {
      localStorage.removeItem(name);
    } catch (error) {
      console.error('[PlayerStore] Failed to remove from localStorage:', error);
    }
  },
}));

// Storage adapter for mobile (AsyncStorage - asynchronous)
const mobileStorage = createJSONStorage<Record<string, any>>(() => ({
  getItem: async (name: string): Promise<string | null> => {
    try {
      const value = await AsyncStorage.getItem(name);
      return value;
    } catch (error) {
      console.error('[PlayerStore] Failed to read from AsyncStorage:', error);
      throw error;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(name, value);
    } catch (error) {
      console.error('[PlayerStore] Failed to write to AsyncStorage:', error);
      throw error;
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await AsyncStorage.removeItem(name);
    } catch (error) {
      console.error('[PlayerStore] Failed to remove from AsyncStorage:', error);
      throw error;
    }
  },
}));

// Select the appropriate storage based on platform
const isWeb = typeof window !== 'undefined' && typeof localStorage !== 'undefined';
const storage = isWeb ? webStorage : mobileStorage;

// Maximum number of tracks in recent history
const MAX_RECENT_HISTORY = 50;

// Throttling for position updates to prevent excessive AsyncStorage writes
let lastPositionSaveTime = 0;
const POSITION_SAVE_THROTTLE_MS = 30000; // Save position at most every 30 seconds

interface PlayerState {
  // --- State ---
  currentTrack: Track | null;
  queue: Track[];
  queueIndex: number;
  recentHistory: Track[];
  isPlaying: boolean;
  isBuffering: boolean;
  position: number; // in seconds
  duration: number; // in seconds
  volume: number;   // 0.0 to 1.0
  isShuffle: boolean;
  repeatMode: RepeatMode;
  isLoading: boolean;
  error: string | null;
  // Internal flag to prevent calling next() multiple times when track finishes
  isTransitioning: boolean;
  // Session restoration flag
  _sessionRestored: boolean;

  // --- Actions ---
  /** Initialize the store: subscribe to audio status and load initial state. */
  init: () => () => void;

  /** Play a specific track and set up the queue. */
  playTrack: (track: Track, fromQueue?: Track[]) => Promise<void>;

  /** Clear any playback error. */
  clearError: () => void;

  /** Toggle between play and pause. */
  togglePlay: () => void;

  /** Play the next track in the queue. */
  next: () => void;

  /** Play the previous track in the queue. */
  prev: () => void;

  /** Seek to a position in seconds. */
  seek: (seconds: number) => Promise<void>;

  /** Set playback volume (0.0 to 1.0). */
  setVolume: (volume: number) => void;

  /** Toggle shuffle mode. */
  toggleShuffle: () => void;

  /** Cycle through repeat modes. */
  setRepeat: (mode: RepeatMode) => void;

  /** Clear recent history. */
  clearRecentHistory: () => void;

  /** Restore playback session (called after hydration). */
  _restoreSession: () => Promise<void>;

  /** Internal: Add to recent history (avoiding consecutive duplicates). */
  _addToRecentHistory: (track: Track) => void;

  /** Internal: Throttled position save for session restoration. */
  _savePosition: () => void;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      // Initial state
      currentTrack: null,
      queue: [],
      queueIndex: -1,
      recentHistory: [],
      isPlaying: false,
      isBuffering: false,
      position: 0,
      duration: 0,
      volume: 1.0,
      isShuffle: false,
      repeatMode: 'off',
      isLoading: false,
      error: null,
      isTransitioning: false,
      _sessionRestored: false,

      init: () => {
        // Synchronize with audioService status updates
        const unsubscribe = audioService.onStatusUpdate((status) => {
          const { isTransitioning } = get();

          if (isTransitioning && status.playing && !status.isBuffering) {
            // Track has started playing successfully, clear transition flag
            set({
              isTransitioning: false,
              isPlaying: status.playing,
              isBuffering: status.isBuffering,
              position: status.currentTime,
              duration: status.duration,
            });
          } else if (!isTransitioning) {
            // Normal state updates when not transitioning
            set({
              isPlaying: status.playing,
              isBuffering: status.isBuffering,
              position: status.currentTime,
              duration: status.duration,
            });

            // Handle track finished - only call next if not already transitioning
            if (status.didJustFinish) {
              get().next();
            }
          } else {
            // Still transitioning but get intermediate status updates
            set({
              isPlaying: status.playing,
              isBuffering: status.isBuffering,
              position: status.currentTime,
              duration: status.duration,
            });
          }

          // Throttled position saving for session restoration
          get()._savePosition();
        });

        // Sync initial volume
        set({ volume: audioService.getVolume() });

        // Restore session after initialization (ensure paused state)
        get()._restoreSession();

        return unsubscribe;
      },

      clearError: () => set({ error: null }),

      _addToRecentHistory: (track: Track) => {
        set(state => {
          // Avoid consecutive duplicate entries
          if (state.currentTrack?.id === track.id) {
            return { recentHistory: state.recentHistory };
          }

          // Remove existing entry if present (to avoid duplicates elsewhere)
          let newHistory = state.recentHistory.filter(t => t.id !== track.id);

          // Add new track at the front, limit to MAX_RECENT_HISTORY
          newHistory = [track, ...newHistory].slice(0, MAX_RECENT_HISTORY);

          return { recentHistory: newHistory };
        });
      },

      // Throttled position save for session restoration
      _savePosition: () => {
        const now = Date.now();
        if (now - lastPositionSaveTime < POSITION_SAVE_THROTTLE_MS) {
          return;
        }
        lastPositionSaveTime = now;

        const { currentTrack, position } = get();

        // Only persist if we have a valid current track
        if (currentTrack && currentTrack.id) {
          set({
            position: position,
          });
        }
      },

      playTrack: async (track, fromQueue) => {
        // 1. Calculate queue index
        let queueIndex = -1;
        if (fromQueue) {
          queueIndex = fromQueue.findIndex(t => t.id === track.id);
          set({ queue: fromQueue });
        }

        // 2. Add to recent history
        get()._addToRecentHistory(track);

        // 3. Immediate UI state update - set transitioning flag
        set({
          isLoading: true,
          currentTrack: track,
          isPlaying: true, // Optimistic UI
          error: null,
          queueIndex,
          isTransitioning: true,
        });

        try {
          await audioService.playTrack(track);
          set({ isLoading: false });
        } catch (err) {
          console.error('[PlayerStore] Failed to play track:', err);
          set({
            isLoading: false,
            isPlaying: false,
            error: err instanceof Error ? err.message : 'Unable to play this track. Check your connection and try again.',
            isTransitioning: false,
          });
        }
      },

      togglePlay: () => {
        const { isPlaying } = get();
        if (isPlaying) {
          audioService.pause();
        } else {
          audioService.resume();
        }
      },

      next: () => {
        const { queue, queueIndex, repeatMode, isShuffle, isTransitioning } = get();

        if (isTransitioning) return;
        if (queue.length === 0) return;

        // If shuffle is enabled, pick a random track from the queue
        if (isShuffle) {
          let shuffleIndex = Math.floor(Math.random() * queue.length);
          if (queue.length > 1) {
            let attempts = 0;
            while (shuffleIndex === queueIndex && attempts < 5) {
              shuffleIndex = Math.floor(Math.random() * queue.length);
              attempts++;
            }
          }

          const nextTrack = queue[shuffleIndex];

          set(state => {
            let newHistory = state.recentHistory.filter(t => t.id !== state.currentTrack?.id);
            newHistory = [nextTrack, ...newHistory].slice(0, MAX_RECENT_HISTORY);
            return { recentHistory: newHistory };
          });

          set({
            queueIndex: shuffleIndex,
            currentTrack: nextTrack,
            position: 0,
            duration: 0,
            isTransitioning: true,
            isLoading: true,
          });

          audioService.playTrack(nextTrack).catch((err) => {
            console.error('[PlayerStore] Failed to play next track:', err);
            set({
              isLoading: false,
              isPlaying: false,
              error: err instanceof Error ? err.message : 'Failed to play next track',
              isTransitioning: false,
            });
          });
          return;
        }

        // Handle Repeat One - restart current track
        if (repeatMode === 'track') {
          audioService.seekTo(0).then(() => {
            set({ position: 0 });
          }).catch((err) => {
            console.error('[PlayerStore] Failed to replay track:', err);
          });
          return;
        }

        // Handle Repeat All - cycle back to beginning
        if (repeatMode === 'all') {
          let nextIndex = (queueIndex + 1) % queue.length;
          const nextTrack = queue[nextIndex];

          set(state => {
            let newHistory = state.recentHistory.filter(t => t.id !== state.currentTrack?.id);
            newHistory = [nextTrack, ...newHistory].slice(0, MAX_RECENT_HISTORY);
            return { recentHistory: newHistory };
          });

          set({
            queueIndex: nextIndex,
            currentTrack: nextTrack,
            position: 0,
            duration: 0,
            isTransitioning: true,
            isLoading: true,
          });

          audioService.playTrack(nextTrack).catch((err) => {
            console.error('[PlayerStore] Failed to play next track:', err);
            set({
              isLoading: false,
              isPlaying: false,
              error: err instanceof Error ? err.message : 'Failed to play next track',
              isTransitioning: false,
            });
          });
          return;
        }

        // Repeat Off - advance to next track, stop at end of queue
        let nextIndex = queueIndex + 1;

        if (nextIndex >= queue.length) {
          return; // end of queue, stop
        }

        const nextTrack = queue[nextIndex];

        set(state => {
          let newHistory = state.recentHistory.filter(t => t.id !== state.currentTrack?.id);
          newHistory = [nextTrack, ...newHistory].slice(0, MAX_RECENT_HISTORY);
          return { recentHistory: newHistory };
        });

        set({
          queueIndex: nextIndex,
          currentTrack: nextTrack,
          position: 0,
          duration: 0,
          isTransitioning: true,
          isLoading: true,
        });

        audioService.playTrack(nextTrack).catch((err) => {
          console.error('[PlayerStore] Failed to play next track:', err);
          set({
            isLoading: false,
            isPlaying: false,
            error: err instanceof Error ? err.message : 'Failed to play next track',
            isTransitioning: false,
          });
        });
      },

      prev: () => {
        const { queue, queueIndex, position, isTransitioning } = get();

        if (isTransitioning) return;
        if (queue.length === 0) return;

        // If we're more than 3 seconds into the song, just restart the song
        if (position > 3) {
          audioService.seekTo(0);
          return;
        }

        let prevIndex = queueIndex - 1;
        if (prevIndex < 0) {
          prevIndex = 0; // stay at first track
        }

        const prevTrack = queue[prevIndex];

        set({
          queueIndex: prevIndex,
          currentTrack: prevTrack,
          position: 0,
          duration: 0,
          isTransitioning: true,
          isLoading: true,
        });

        audioService.playTrack(prevTrack).catch((err) => {
          console.error('[PlayerStore] Failed to play previous track:', err);
          set({
            isLoading: false,
            isPlaying: false,
            error: err instanceof Error ? err.message : 'Failed to play previous track',
            isTransitioning: false,
          });
        });
      },

      seek: async (seconds: number): Promise<void> => {
        if (!Number.isFinite(seconds)) {
          return;
        }

        const { duration: currentDuration, position: currentPosition } = get();

        const validDuration = currentDuration > 0 ? currentDuration : 1000;
        const clampedSeconds = Math.max(0, Math.min(validDuration, seconds));

        if (Math.abs(currentPosition - clampedSeconds) < 0.1) {
          return;
        }

        try {
          await audioService.seekTo(clampedSeconds);
          set({ position: clampedSeconds });
        } catch (err) {
          console.error('[PlayerStore] Seek failed:', err);
          set({ error: 'Could not seek to that position.' });
        }
      },

      setVolume: (volume) => {
        audioService.setVolume(volume);
        set({ volume });
      },

      toggleShuffle: () => {
        set(state => ({ isShuffle: !state.isShuffle }));
      },

      setRepeat: (mode) => {
        set({ repeatMode: mode });
      },

      clearRecentHistory: () => set({ recentHistory: [] }),

      // Session restoration - called after hydration to validate and restore
      _restoreSession: async () => {
        const { currentTrack, queue, queueIndex, position, _sessionRestored } = get();

        // Prevent multiple restorations
        if (_sessionRestored) return;

        // Validate we have a current track
        if (currentTrack && currentTrack.uri) {
          // Verify the currentTrack is in the queue (if queue exists)
          if (queue.length > 0 && queueIndex >= 0 && queueIndex < queue.length) {
            const trackInQueue = queue.some(t => t.id === currentTrack.id);
            if (!trackInQueue) {
              // Track not in queue (e.g., Home's synthetic queue differs from Library's source queue)
              // Don't fail - still attempt to restore the track for session continuity
              console.warn('[PlayerStore] Current track not in queue, but attempting restore anyway');
            }
          } else {
            // No valid queue - still restore the current track
            console.warn('[PlayerStore] No valid queue for session restore');
          }

          // Load the track into the audio service (without playing)
          try {
            await audioService.prepareTrack(currentTrack);

            // Restore position if track has duration info
            if (position > 0) {
              await audioService.seekTo(position);
            }
          } catch (err) {
            console.error('[PlayerStore] Failed to prepare track for session restore:', err);
          }

          // Ensure player is paused on restoration
          set({
            isPlaying: false,
            isBuffering: false,
            _sessionRestored: true
          });

          console.log('[PlayerStore] Session restored - track loaded, position:', position);
        } else {
          // No valid session to restore - ensure paused state
          set({
            isPlaying: false,
            _sessionRestored: true
          });
        }
      },
    }),
    {
      name: 'nv-music-player',
      storage,
      // Persist only serializable state
      partialize: (state) => ({
        currentTrack: state.currentTrack,
        queue: state.queue,
        queueIndex: state.queueIndex,
        recentHistory: state.recentHistory,
        volume: state.volume,
        isShuffle: state.isShuffle,
        repeatMode: state.repeatMode,
        position: state.position,
      }),
      // Migration for schema changes
      migrate: (persistedState: any) => {
        if (!persistedState) return persistedState;

        const state = persistedState.state || persistedState;

        // Ensure all required fields exist with safe defaults
        return {
          state: {
            currentTrack: typeof state.currentTrack === 'object' && state.currentTrack !== null ? state.currentTrack : null,
            queue: Array.isArray(state.queue) ? state.queue : [],
            queueIndex: typeof state.queueIndex === 'number' ? state.queueIndex : -1,
            recentHistory: Array.isArray(state.recentHistory) ? state.recentHistory : [],
            volume: typeof state.volume === 'number' ? state.volume : 1.0,
            isShuffle: Boolean(state.isShuffle),
            repeatMode: ['off', 'all', 'track'].includes(state.repeatMode) ? state.repeatMode : 'off',
            position: typeof state.position === 'number' ? state.position : 0,
            isPlaying: false, // Always false on fresh start - restored state
            isBuffering: false,
            duration: 0,
            isLoading: false,
            error: null,
            isTransitioning: false,
            _sessionRestored: false,
          },
        };
      },
    }
  )
);

// Re-export Track type for convenience
export type { Track };
export type { RepeatMode };
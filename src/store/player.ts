/**
 * Zustand Player Store.
 *
 * The single source of truth for NV Music's playback state.
 *
 * It coordinates between the audio engine (audioService), the music
 * sources (services/sources), and the React UI.
 */

import { create } from 'zustand';
import { audioService } from '@/services/audio';
import { Track, RepeatMode } from '@/types/music';

interface PlayerState {
  // --- State ---
  currentTrack: Track | null;
  queue: Track[];
  queueIndex: number;
  recentHistory: Track[]; // Separate playback history, independent of queue
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

  // --- Actions ---
  /** Initialize the store: subscribe to audio status and load initial state. */
  init: () => () => void; // returns an unsubscribe function

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
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
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

  init: () => {
    // Synchronize with audioService status updates
    const unsubscribe = audioService.onStatusUpdate((status) => {
      const { isTransitioning } = get();

      // Update playback state from audio service
      // When transitioning completes, isTransitioning should be reset
      // when status shows stable playing state (playing: true, isBuffering: false)

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
    });

    // Sync initial volume
    set({ volume: audioService.getVolume() });

    return unsubscribe;
  },

  clearError: () => set({ error: null }),

  playTrack: async (track, fromQueue) => {
    // 1. Calculate queue index
    let queueIndex = -1;
    if (fromQueue) {
      queueIndex = fromQueue.findIndex(t => t.id === track.id);
      set({ queue: fromQueue });
    }

    // 2. Add to recent history (separate from queue - independent tracking)
    set(state => {
      const newHistory = [track, ...state.recentHistory].slice(0, 50); // Keep last 50 tracks
      return { recentHistory: newHistory };
    });

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
        error: err instanceof Error ? err.message : 'Failed to play track',
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

    // Guard: don't call next() multiple times during transition
    if (isTransitioning) return;

    if (queue.length === 0) return;

    // If shuffle is enabled, pick a random track from the queue
    if (isShuffle) {
      // Pick a random index, but try to avoid picking the same track
      let shuffleIndex = Math.floor(Math.random() * queue.length);
      if (queue.length > 1) {
        // Avoid picking the current track when possible
        let attempts = 0;
        while (shuffleIndex === queueIndex && attempts < 5) {
          shuffleIndex = Math.floor(Math.random() * queue.length);
          attempts++;
        }
      }

      const nextTrack = queue[shuffleIndex];

      // Update history: remove current track from history if present, add next track
      set(state => {
        let newHistory = state.recentHistory.filter(t => t.id !== state.currentTrack?.id);
        newHistory = [nextTrack, ...newHistory].slice(0, 50);
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
      // Replay current track at position 0
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

      // Update history: remove current track from history, add next track
      set(state => {
        let newHistory = state.recentHistory.filter(t => t.id !== state.currentTrack?.id);
        newHistory = [nextTrack, ...newHistory].slice(0, 50);
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

    // Update history: remove current track from history, add next track
    set(state => {
      let newHistory = state.recentHistory.filter(t => t.id !== state.currentTrack?.id);
      newHistory = [nextTrack, ...newHistory].slice(0, 50);
      return { recentHistory: newHistory };
    });

    // Set transitioning flag before calling audioService to prevent duplicate calls
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

    // Guard: don't call prev() if already transitioning
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

    // Set transitioning flag before calling audioService
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
      // Reject invalid or non-finite values
      if (!Number.isFinite(seconds)) {
        return;
      }

      // Get current state values
      const { duration: currentDuration, position: currentPosition } = get();

      // Clamp target to valid duration range when duration is known
      const validDuration = currentDuration > 0 ? currentDuration : 1000; // Default to 1000s if unknown
      const clampedSeconds = Math.max(0, Math.min(validDuration, seconds));

      // Ignore if position wouldn't change meaningfully
      if (Math.abs(currentPosition - clampedSeconds) < 0.1) {
        return;
      }

      try {
        await audioService.seekTo(clampedSeconds);
        set({ position: clampedSeconds });
      } catch (err) {
        console.error('[PlayerStore] Seek failed:', err);
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
}));
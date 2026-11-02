/**
 * Liked Songs Store
 *
 * Manages user's liked/favorited tracks
 * Persists across app sessions using localStorage (web) and AsyncStorage (mobile)
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage adapter for web (localStorage - synchronous)
const webStorage = createJSONStorage<Record<string, any>>(() => ({
  getItem: (name: string): string | null => {
    try {
      return localStorage.getItem(name);
    } catch (error) {
      console.error('[LikesStore] Failed to read from localStorage:', error);
      return null;
    }
  },
  setItem: (name: string, value: string): void => {
    try {
      localStorage.setItem(name, value);
    } catch (error) {
      console.error('[LikesStore] Failed to write to localStorage:', error);
    }
  },
  removeItem: (name: string): void => {
    try {
      localStorage.removeItem(name);
    } catch (error) {
      console.error('[LikesStore] Failed to remove from localStorage:', error);
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
      console.error('[LikesStore] Failed to read from AsyncStorage:', error);
      throw error; // Re-throw to make errors visible during development
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(name, value);
    } catch (error) {
      console.error('[LikesStore] Failed to write to AsyncStorage:', error);
      throw error; // Re-throw to make errors visible during development
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await AsyncStorage.removeItem(name);
    } catch (error) {
      console.error('[LikesStore] Failed to remove from AsyncStorage:', error);
      throw error; // Re-throw to make errors visible during development
    }
  },
}));

// Select the appropriate storage based on platform
const isWeb = typeof window !== 'undefined' && typeof localStorage !== 'undefined';
const storage = isWeb ? webStorage : mobileStorage;

interface LikesState {
  likedTrackIds: Set<string> | string[];
  likeTrack: (trackId: string) => void;
  unlikeTrack: (trackId: string) => void;
  isLiked: (trackId: string) => boolean;
  getLikedCount: () => number;
}

export const useLikesStore = create<LikesState>()(
  persist(
    (set, get) => ({
      likedTrackIds: new Set(),

      likeTrack: (trackId: string) => {
        set((state) => {
          const currentIds = state.likedTrackIds instanceof Set
            ? state.likedTrackIds
            : new Set(state.likedTrackIds as Iterable<string>);
          const newSet = new Set(currentIds);
          newSet.add(trackId);
          return { likedTrackIds: newSet };
        });
      },

      unlikeTrack: (trackId: string) => {
        set((state) => {
          const currentIds = state.likedTrackIds instanceof Set
            ? state.likedTrackIds
            : new Set(state.likedTrackIds as Iterable<string>);
          const newSet = new Set(currentIds);
          newSet.delete(trackId);
          return { likedTrackIds: newSet };
        });
      },

      isLiked: (trackId: string) => {
        const ids = get().likedTrackIds;
        // Handle case where likedTrackIds might be an array (hydration issue)
        if (ids instanceof Set) {
          return ids.has(trackId);
        } else if (Array.isArray(ids)) {
          return ids.includes(trackId);
        }
        return false;
      },

      getLikedCount: () => {
        const ids = get().likedTrackIds;
        if (ids instanceof Set) {
          return ids.size;
        } else if (Array.isArray(ids)) {
          return ids.length;
        }
        return 0;
      },
    }),
    {
      name: 'nv-music-likes',
      storage,
      partialize: (state) => ({ likedTrackIds: Array.from(state.likedTrackIds) }),
      migrate: (persistedState: any) => {
        // Extract the array of liked track IDs from persisted state
        // Zustand persist can store in two formats:
        // 1. Modern format: { state: { likedTrackIds: [...] } }
        // 2. Legacy format: { likedTrackIds: [...] }
        let trackIdsArray: string[] = [];

        if (persistedState) {
          // Modern format - state is nested
          if (persistedState.state?.likedTrackIds) {
            trackIdsArray = persistedState.state.likedTrackIds;
          }
          // Legacy format - likedTrackIds at root level
          else if (Array.isArray(persistedState.likedTrackIds)) {
            trackIdsArray = persistedState.likedTrackIds;
          }
          // Already a Set (rare edge case)
          else if (persistedState.likedTrackIds instanceof Set) {
            return persistedState;
          }
        }

        // If we found valid track IDs, reconstruct the state with a proper Set
        if (trackIdsArray && Array.isArray(trackIdsArray)) {
          return {
            state: {
              likedTrackIds: new Set(trackIdsArray),
            },
          };
        }

        // Return as-is if we can't parse (will start fresh)
        return persistedState;
      },
    }
  )
);
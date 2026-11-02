/**
 * Liked Songs Store
 *
 * Manages user's liked/favorited tracks
 * Persists across app sessions using localStorage (web)
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Storage adapter that falls back gracefully
const storage = {
  getItem: (name: string): string | null => {
    // Web: use localStorage
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(name);
    }
    // Mobile: no persistence if AsyncStorage not available
    return null;
  },
  setItem: (name: string, value: string): void => {
    // Web: use localStorage
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(name, value);
      return;
    }
    // Mobile: no-op if AsyncStorage not available
  },
  removeItem: (name: string): void => {
    // Web: use localStorage
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(name);
      return;
    }
    // Mobile: no-op if AsyncStorage not available
  },
};

interface LikesState {
  likedTrackIds: Set<string>;
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
          const newSet = new Set(state.likedTrackIds);
          newSet.add(trackId);
          return { likedTrackIds: newSet };
        });
      },

      unlikeTrack: (trackId: string) => {
        set((state) => {
          const newSet = new Set(state.likedTrackIds);
          newSet.delete(trackId);
          return { likedTrackIds: newSet };
        });
      },

      isLiked: (trackId: string) => {
        return get().likedTrackIds.has(trackId);
      },

      getLikedCount: () => {
        return get().likedTrackIds.size;
      },
    }),
    {
      name: 'nv-music-likes',
      // @ts-expect-error - Storage types are complex, this works at runtime
      storage,
      partialize: (state) => ({ likedTrackIds: Array.from(state.likedTrackIds) }),
      migrate: (persistedState: any) => {
        if (persistedState?.state?.likedTrackIds) {
          return {
            state: {
              ...persistedState.state,
              likedTrackIds: new Set(persistedState.state.likedTrackIds),
            },
          };
        }
        return persistedState;
      },
    }
  )
);
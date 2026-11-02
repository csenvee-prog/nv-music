/**
 * Seed data for NV Music UI.
 *
 * Contains sample playlists, albums, and artist metadata to populate the
 * Home, Library, and Explore screens with a rich dark aesthetic.
 *
 * NOTE: Per instructions, this file does NOT contain fake audio files or
 * invalid URIs. Playable tracks come from the source adapters (local library
 * or legitimate demo files when available).
 */

import { Playlist, Album, Artist, Track } from '@/types/music';

// Demo tracks from the demo source adapter
export const DEMO_TRACKS: Track[] = [
  {
    id: 'demo-track-1',
    title: 'Piano Loop',
    artist: 'InspectorJ',
    album: 'Demo Tracks',
    duration: 4.0,
    uri: 'https://assets.mixkit.co/music/download/preview/1006/1006-2.mp3',
    artworkUrl: null,
    sourceId: 'demo',
    sourceType: 'demo',
    year: 2023,
    trackNumber: 1,
  },
  {
    id: 'demo-track-2',
    title: 'Chill Vibes',
    artist: 'Sample Artist',
    album: 'Demo Collection',
    duration: 15.0,
    uri: 'https://assets.mixkit.co/music/download/preview/728/728-2.mp3',
    artworkUrl: null,
    sourceId: 'demo',
    sourceType: 'demo',
    year: 2022,
    trackNumber: 2,
  },
  {
    id: 'demo-track-3',
    title: 'Ambient Breeze',
    artist: 'Sample Artist',
    album: 'Demo Collection',
    duration: 20.0,
    uri: 'https://assets.mixkit.co/music/download/preview/729/729-2.mp3',
    artworkUrl: null,
    sourceId: 'demo',
    sourceType: 'demo',
    year: 2023,
    trackNumber: 3,
  },
];

// Map of track IDs to actual Track objects for quick lookup
export const SEED_TRACKS: Record<string, Track> = {};
DEMO_TRACKS.forEach(track => {
  SEED_TRACKS[track.id] = track;
});

export const SEED_PLAYLISTS: Playlist[] = [
  {
    id: 'playlist-chill-night',
    name: 'Midnight Ambience',
    description: 'Deep nocturnal tones and atmospheric soundscapes',
    artworkUrl: null,
    trackIds: ['demo-track-1', 'demo-track-2', 'demo-track-3'],
    sourceId: 'demo',
    isSystem: true,
  },
  {
    id: 'playlist-focus',
    name: 'Deep Focus & Code',
    description: 'Minimal electronic and ambient textures',
    artworkUrl: null,
    trackIds: ['demo-track-1', 'demo-track-2'],
    sourceId: 'demo',
    isSystem: true,
  },
  {
    id: 'playlist-favorites',
    name: 'Liked Songs',
    description: 'Your personal collection of favorite tracks',
    artworkUrl: null,
    trackIds: ['demo-track-2'],
    sourceId: 'demo',
    isSystem: true,
  },
];

export const SEED_ALBUMS: Album[] = [
  {
    id: 'album-1',
    title: 'Neon Horizon',
    artist: 'Synthetics',
    artworkUrl: null,
    year: 2026,
    trackIds: ['demo-track-1', 'demo-track-2', 'demo-track-3'],
  },
  {
    id: 'album-2',
    title: 'Analog Memories',
    artist: 'The Tape Deck',
    artworkUrl: null,
    year: 2025,
    trackIds: ['demo-track-3'],
  },
];

export const SEED_ARTISTS: Artist[] = [
  {
    id: 'artist-1',
    name: 'Synthetics',
    artworkUrl: null,
    trackIds: ['demo-track-1'],
  },
  {
    id: 'artist-2',
    name: 'The Tape Deck',
    artworkUrl: null,
    trackIds: ['demo-track-3'],
  },
  {
    id: 'artist-sample',
    name: 'Sample Artist',
    artworkUrl: null,
    trackIds: ['demo-track-2', 'demo-track-3'],
  },
];

/**
 * Demo Source Adapter.
 *
 * Implements SourceAdapter for bundled/legal demo tracks.
 * Uses a publicly available royalty-free audio file for testing.
 */

import { SourceAdapter, SourcePermissionState, SourceType, Track } from '@/types/music';

export class DemoSourceAdapter implements SourceAdapter {
  readonly id = 'demo';
  readonly type: SourceType = 'demo';
  readonly name = 'Demo Tracks';
  readonly requiresPermission = false;

  async getTracks(): Promise<Track[]> {
    // Use a publicly available royalty-free audio file for testing
    // This is a 4-second piano loop from freesound.org (CC0 licensed)
    // https://freesound.org/people/InspectorJ/sounds/403005/
    return [
      {
        id: 'demo-track-1',
        title: 'Piano Loop',
        artist: 'InspectorJ',
        album: 'Demo Tracks',
        duration: 4.0,
        uri: 'https://assets.mixkit.co/music/download/preview/1006/1006-2.mp3', // Mixkit royalty-free demo
        artworkUrl: null,
        sourceId: this.id,
        sourceType: this.type,
        year: 2023,
        trackNumber: 1,
      },
      {
        id: 'demo-track-2',
        title: 'Chill Vibes',
        artist: 'Sample Artist',
        album: 'Demo Collection',
        duration: 15.0,
        uri: 'https://assets.mixkit.co/music/download/preview/728/728-2.mp3', // Mixkit royalty-free demo
        artworkUrl: null,
        sourceId: this.id,
        sourceType: this.type,
        year: 2022,
        trackNumber: 2,
      },
      {
        id: 'demo-track-3',
        title: 'Ambient Breeze',
        artist: 'Sample Artist',
        album: 'Demo Collection',
        duration: 20.0,
        uri: 'https://assets.mixkit.co/music/download/preview/729/729-2.mp3', // Mixkit royalty-free demo
        artworkUrl: null,
        sourceId: this.id,
        sourceType: this.type,
        year: 2023,
        trackNumber: 3,
      },
    ];
  }

  async getPermissionState(): Promise<SourcePermissionState> {
    return 'granted'; // Demo tracks don't require external permissions
  }
}

export const demoSourceAdapter = new DemoSourceAdapter();

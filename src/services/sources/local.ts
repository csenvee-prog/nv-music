/**
 * Local Music Source Adapter.
 *
 * Implements SourceAdapter for the device's local music library.
 * Uses `expo-media-library` to scan for audio assets.
 *
 * Handles Android/iOS permissions gracefully.
 */

import * as MediaLibrary from 'expo-media-library';
import {
  SourceAdapter,
  SourcePermissionState,
  SourceType,
  Track,
} from '@/types/music';

export class LocalSourceAdapter implements SourceAdapter {
  readonly id = 'local';
  readonly type: SourceType = 'local';
  readonly name = 'Local Library';
  readonly requiresPermission = true;

  /**
   * Scan the device for audio files.
   * Returns Track objects mapped from MediaLibrary assets.
   */
  async getTracks(): Promise<Track[]> {
    const state = await this.getPermissionState();
    if (state !== 'granted') {
      return [];
    }

    try {
      // Query for audio assets. Using Query builder for SDK 58.
      const query = new MediaLibrary.Query()
        .eq(MediaLibrary.AssetField.MEDIA_TYPE, MediaLibrary.MediaType.AUDIO)
        .limit(1000); // Sensible limit for now

      const assets = await query.exe();

      // Resolve info (URI, duration) for each asset
      const tracks: Track[] = await Promise.all(
        assets.map(async (asset) => {
          const [uri, duration, filename] = await Promise.all([
            asset.getUri(),
            asset.getDuration(),
            asset.getFilename(),
          ]);

          // Extract basic info from filename if metadata is missing
          // In a real app, we'd use a metadata reader for ID3 tags.
          const title = filename.replace(/\.[^/.]+$/, '');

          return {
            id: `local-${asset.id}`,
            title: title,
            artist: 'Local Artist',
            album: 'Local Album',
            duration: duration || 0,
            uri: uri,
            artworkUrl: null, // Local artwork requires extra steps to extract
            sourceId: this.id,
            sourceType: this.type,
          };
        })
      );

      return tracks;
    } catch (err) {
      console.warn('[LocalSourceAdapter] Failed to fetch tracks:', err);
      return [];
    }
  }

  /**
   * Check current permission status.
   */
  async getPermissionState(): Promise<SourcePermissionState> {
    try {
      const { status, canAskAgain } = await MediaLibrary.getPermissionsAsync();

      if (status === MediaLibrary.PermissionStatus.GRANTED) {
        return 'granted';
      }
      if (status === MediaLibrary.PermissionStatus.DENIED) {
        return canAskAgain ? 'undetermined' : 'denied';
      }
      return 'undetermined';
    } catch (err) {
      console.warn('[LocalSourceAdapter] Error checking permissions:', err);
      return 'unavailable';
    }
  }

  /**
   * Trigger the system permission prompt.
   */
  async requestPermission(): Promise<SourcePermissionState> {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();

      if (status === MediaLibrary.PermissionStatus.GRANTED) {
        return 'granted';
      }
      return 'denied';
    } catch (err) {
      console.warn('[LocalSourceAdapter] Error requesting permissions:', err);
      return 'denied';
    }
  }
}

export const localSourceAdapter = new LocalSourceAdapter();

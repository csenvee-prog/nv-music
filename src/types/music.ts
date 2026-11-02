/**
 * Shared domain model for NV Music.
 *
 * These types are the single contract between every layer:
 * source adapters (services/sources), the state store (store/player),
 * and the UI (components + screens). New music sources plug in by
 * implementing SourceAdapter and returning Track[] objects shaped like this.
 */

/** Where a track's audio bytes actually live. */
export type SourceType = 'local' | 'demo' | 'streaming';

/** A single playable track. */
export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  /** Duration in seconds; 0 if unknown. */
  duration: number;
  /** URL or absolute local filesystem path passed to the audio player. */
  uri: string;
  /** URL to cover art, or null for a placeholder. */
  artworkUrl: string | null;
  /** Which source adapter produced this track. */
  sourceId: string;
  /** Capability of the source that produced this track. */
  sourceType: SourceType;
  /** Year of release, when known. */
  year?: number;
  /** Track number on the album, when known. */
  trackNumber?: number;
}

/** A playlist grouping tracks. */
export interface Playlist {
  id: string;
  name: string;
  description?: string;
  artworkUrl: string | null;
  trackIds: string[];
  sourceId: string;
  isSystem?: boolean;
}

/** An album grouping tracks. */
export interface Album {
  id: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  year?: number;
  trackIds: string[];
}

/** An artist grouping tracks. */
export interface Artist {
  id: string;
  name: string;
  artworkUrl: string | null;
  trackIds: string[];
}

/**
 * SourceAdapter — the contract every music source implements.
 *
 * A "source" is anything that can hand the app a list of playable tracks:
 * the device's local music library, a bundled demo catalog, or (later)
 * an authorized streaming provider. Each adapter exposes a stable id and
 * a list of tracks. Capabilities are declared explicitly so the UI can
 * adapt (e.g. streaming sources may not support offline downloads).
 */
export interface SourceAdapter {
  readonly id: string;
  readonly type: SourceType;
  /** Human-readable name shown in settings/sources. */
  readonly name: string;
  /** True when this source requires a user grant (e.g. media-library permission). */
  readonly requiresPermission: boolean;

  /**
   * Return the tracks this source can currently provide.
   * Resolves to an empty array when the source is disabled or permission
   * is denied — never throws. Implementations should handle denial
   * gracefully and surface state via the returned `permissionState`.
   */
  getTracks(): Promise<Track[]>;

  /**
   * Optional: return the current permission state for this source.
   * Used by the UI to show a "grant permission" prompt instead of an
   * empty list.
   */
  getPermissionState?(): Promise<SourcePermissionState>;

  /**
   * Optional: request the permission if it is currently denied.
   * Returns the new state. Should not throw.
   */
  requestPermission?(): Promise<SourcePermissionState>;
}

export type SourcePermissionState = 'granted' | 'denied' | 'undetermined' | 'unavailable';

/** The shape of the player's queue. */
export interface QueueState {
  tracks: string[]; // track ids
  currentIndex: number;
}

/** Repeat modes for the player. */
export type RepeatMode = 'off' | 'track' | 'all';
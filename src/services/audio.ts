/**
 * Persistent Audio Service for NV Music.
 *
 * This singleton wraps `expo-audio` (SDK 58) to manage background audio playback,
 * audio session configuration, and status event subscriptions cleanly.
 *
 * It decouples playback logic from React UI components: UI and store components
 * interact with this service rather than manipulating raw player objects directly.
 */

import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
  type AudioMetadata,
  type AudioSource,
} from 'expo-audio';
import { type EventSubscription } from 'expo';
import { type Track } from '@/types/music';

export type StatusUpdateCallback = (status: AudioStatus) => void;

class AudioService {
  private player: AudioPlayer | null = null;
  private statusSubscription: EventSubscription | null = null;
  private currentTrack: Track | null = null;
  private isConfigured = false;
  private listeners: Set<StatusUpdateCallback> = new Set();

  /**
   * Configure the global audio session for background playback & lock-screen controls.
   * Safe to call multiple times; only executes once.
   */
  async configure(): Promise<void> {
    if (this.isConfigured) return;
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'doNotMix',
      });
      this.isConfigured = true;
    } catch (err) {
      console.warn('[AudioService] Failed to set audio mode:', err);
    }
  }

  /**
   * Ensure an AudioPlayer instance exists and subscription is hooked up.
   */
  private getOrCreatePlayer(initialSource?: AudioSource): AudioPlayer {
    if (!this.player) {
      this.player = createAudioPlayer(initialSource ?? null);
      this.attachStatusListener();
    }
    return this.player;
  }

  /**
   * Clean up existing status listener and attach a single listener to the player.
   */
  private attachStatusListener(): void {
    if (this.statusSubscription) {
      this.statusSubscription.remove();
      this.statusSubscription = null;
    }

    if (this.player) {
      this.statusSubscription = this.player.addListener(
        'playbackStatusUpdate',
        (status: AudioStatus) => {
          this.notifyListeners(status);
        }
      );
    }
  }

  /**
   * Broadcast status updates to all registered callbacks.
   */
  private notifyListeners(status: AudioStatus): void {
    for (const callback of this.listeners) {
      try {
        callback(status);
      } catch (err) {
        console.error('[AudioService] Error in status update listener:', err);
      }
    }
  }

  /**
   * Subscribe to playback status updates (play, pause, position, buffering, ended).
   * Returns an unsubscribe function.
   */
  onStatusUpdate(callback: StatusUpdateCallback): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Load and play a track. Updates lock-screen metadata if supported.
   */
  async playTrack(track: Track): Promise<void> {
    await this.configure();

    const source: AudioSource = { uri: track.uri };
    this.currentTrack = track;

    if (!this.player) {
      this.player = createAudioPlayer(source);
      this.attachStatusListener();
    } else {
      this.player.replace(source);
    }

    // Give the player a moment to load the source
    await new Promise(resolve => setTimeout(resolve, 100));

    this.updateLockScreen(track);
    this.player.play();
  }

  /**
   * Pause playback.
   */
  pause(): void {
    if (this.player) {
      this.player.pause();
    }
  }

  /**
   * Resume playback of the current track.
   */
  resume(): void {
    if (this.player) {
      this.player.play();
    }
  }

  /**
   * Prepare the player with a track without starting playback.
   * Used for session restoration to load the track into the audio service.
   */
  async prepareTrack(track: Track): Promise<void> {
    await this.configure();

    const source: AudioSource = { uri: track.uri };

    if (!this.player) {
      this.player = createAudioPlayer(source);
      this.attachStatusListener();
    } else {
      this.player.replace(source);
    }

    // Give the player a moment to load the source
    await new Promise(resolve => setTimeout(resolve, 100));

    this.currentTrack = track;
    this.updateLockScreen(track);
  }

  /**
   * Seek to a specific position in seconds.
   */
  async seekTo(seconds: number): Promise<void> {
    if (this.player) {
      await this.player.seekTo(seconds);
    }
  }

  /**
   * Set playback volume (range 0.0 to 1.0).
   */
  setVolume(volume: number): void {
    if (this.player) {
      const clamped = Math.max(0, Math.min(1, volume));
      this.player.volume = clamped;
    }
  }

  /**
   * Set playback speed rate (e.g. 1.0, 1.5, 2.0).
   */
  setPlaybackRate(rate: number): void {
    if (this.player) {
      this.player.setPlaybackRate(rate);
    }
  }

  /**
   * Update lock-screen metadata and controls for Android/iOS notification area.
   */
  private updateLockScreen(track: Track): void {
    if (!this.player) return;

    const metadata: AudioMetadata = {
      title: track.title,
      artist: track.artist,
      albumTitle: track.album || undefined,
      artworkUrl: track.artworkUrl || undefined,
    };

    try {
      this.player.setActiveForLockScreen(true, metadata, {
        showNextTrack: true,
        showPreviousTrack: true,
        showSeekBackward: true,
        showSeekForward: true,
      });
    } catch (err) {
      // Lock screen controls might fail on web or non-supported environments gracefully
      console.warn('[AudioService] Could not set lock screen controls:', err);
    }
  }

  /**
   * Release resources when stopping completely.
   */
  release(): void {
    if (this.statusSubscription) {
      this.statusSubscription.remove();
      this.statusSubscription = null;
    }

    if (this.player) {
      try {
        this.player.clearLockScreenControls();
      } catch {}
      this.player.remove();
      this.player = null;
    }

    this.currentTrack = null;
    this.listeners.clear();
  }

  /**
   * Get current track being played.
   */
  getCurrentTrack(): Track | null {
    return this.currentTrack;
  }

  /**
   * Get current volume (0.0 to 1.0).
   */
  getVolume(): number {
    return this.player?.volume ?? 1.0;
  }

  /**
   * Check if player is currently playing.
   */
  isPlaying(): boolean {
    return this.player?.playing ?? false;
  }

  /**
   * Get the current audio status from the player.
   */
  getStatus(): AudioStatus | null {
    return this.player?.currentStatus || null;
  }
}

export const audioService = new AudioService();

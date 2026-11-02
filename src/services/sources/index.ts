/**
 * Sources Registry.
 *
 * Merges all registered music sources into a unified API for the store/UI.
 * New streaming adapters should be added here to be discovered by the app.
 */

import { SourceAdapter, Track } from '@/types/music';
import { localSourceAdapter } from './local';
import { demoSourceAdapter } from './demo';

/** All registered music sources. */
export const SOURCES: SourceAdapter[] = [
  localSourceAdapter,
  demoSourceAdapter,
];

/**
 * Unified way to fetch tracks from all available sources.
 * Aggregates results into a single list.
 */
export async function getAllTracks(): Promise<Track[]> {
  const results = await Promise.allSettled(
    SOURCES.map(source => source.getTracks())
  );

  return results
    .filter((r): r is PromiseFulfilledResult<Track[]> => r.status === 'fulfilled')
    .flatMap(r => r.value);
}

/** Get a specific source by its unique ID. */
export function getSource(id: string): SourceAdapter | undefined {
  return SOURCES.find(s => s.id === id);
}

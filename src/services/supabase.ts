/**
 * NV Music Supabase Client
 *
 * Provides a configured Supabase client for the application.
 * Reads credentials from environment variables (EXPO_PUBLIC_SUPABASE_URL
 * and EXPO_PUBLIC_SUPABASE_ANON_KEY) and initializes the client.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

/**
 * Reads Supabase configuration from environment/Constants.
 * @returns Object with url and anonKey, or null if missing.
 */
function getSupabaseConfig(): { url: string; anonKey: string } | null {
  // Expo Load the environment variables from .env using expo-constants
  const url = Constants.expoConfig?.extra?.supabaseUrl as string | undefined;
  const anonKey = Constants.expoConfig?.extra?.supabaseAnonKey as string | undefined;

  // For web/dev, also check process.env
  const envUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const envAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  const resolvedUrl = url ?? envUrl;
  const resolvedAnonKey = anonKey ?? envAnonKey;

  if (!resolvedUrl || !resolvedAnonKey) {
    console.warn(
      '[NV Music] Supabase credentials not found. ' +
      'Ensure EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are set in your .env file.'
    );
    return null;
  }

  return { url: resolvedUrl, anonKey: resolvedAnonKey };
}

/**
 * Get the configured Supabase client instance.
 * @returns SupabaseClient instance or null if credentials are missing.
 */
export function getSupabaseClient(): SupabaseClient | null {
  const config = getSupabaseConfig();
  if (!config) {
    // Return a placeholder client that will fail gracefully on use
    return createClient(
      'https://placeholder.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder'
    );
  }

  return createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

// Singleton instance (created lazily)
let _client: SupabaseClient | null = null;

/**
 * Get or create the singleton Supabase client.
 */
export function getSupabase(): SupabaseClient {
  if (!_client) {
    _client = getSupabaseClient();
  }
  return _client!;
}

// Re-export types for convenience
export type { SupabaseClient } from '@supabase/supabase-js';

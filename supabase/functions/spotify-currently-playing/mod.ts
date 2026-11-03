/// <reference lib="deno.ns" />
// supabase/functions/spotify-currently-playing/mod.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decryptToken, encryptToken } from '../_shared/encryption.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const PROVIDER_TIMEOUT_MS = 10000;
const TOKEN_REFRESH_TIMEOUT_MS = 12000;

function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

function jsonError(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info'
      }
    });
  }

  if (req.method !== 'GET') {
    return jsonError('Method not allowed. Use GET or OPTIONS.', 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonError('Missing Authorization header', 401);
  }

  const token = authHeader.split(' ')[1];
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return jsonError('Invalid or expired authentication token', 401);
  }

  const { data: connection, error: dbError } = await supabase
    .from('provider_connections')
    .select('id, access_token_encrypted, access_token_nonce, access_token_tag, refresh_token_encrypted, refresh_token_nonce, refresh_token_tag, key_version, expires_at')
    .eq('user_id', user.id)
    .eq('provider', 'spotify')
    .single();

  if (dbError) {
    return jsonError('Spotify not connected. Please connect your Spotify account in settings.', 404);
  }

  let accessToken: string;
  try {
    accessToken = await decryptToken(
      connection.access_token_encrypted,
      connection.access_token_nonce,
      connection.access_token_tag,
      connection.key_version ?? 1
    );
  } catch {
    console.error('[Edge] Token decryption failed');
    return jsonError('Failed to decrypt credentials', 500);
  }

  // Call Spotify API with proper error distinction
  const spotifyResult = await fetchSpotifyAPI(accessToken, PROVIDER_TIMEOUT_MS);

  switch (spotifyResult.type) {
    case 'success':
      if (spotifyResult.status === 204) {
        return jsonResponse({ data: null, status: 'not_playing' });
      }
      return jsonResponse({ data: spotifyResult.data });

    case 'http_error':
      if (spotifyResult.status === 401) {
        const refreshResult = await tokenRefreshWithRetry(connection);
        return refreshResult;
      }
      console.error('[Edge] Spotify API HTTP error:', spotifyResult.status);
      return jsonError('Spotify API error', spotifyResult.status);

    case 'network_error':
      return jsonError('Network error communicating with Spotify', 502);

    case 'timeout':
      return jsonError('Request to Spotify timed out. Please try again.', 504);

    case 'parse_error':
      return jsonError('Invalid response from Spotify', 502);
  }
});

type FetchSuccessResult = { type: 'success'; status: number; data: unknown };
type FetchHTTPErrorResult = { type: 'http_error'; status: number };
type FetchNetworkErrorResult = { type: 'network_error' };
type FetchTimeoutResult = { type: 'timeout' };
type FetchParseErrorResult = { type: 'parse_error' };
type FetchResult = FetchSuccessResult | FetchHTTPErrorResult | FetchNetworkErrorResult | FetchTimeoutResult | FetchParseErrorResult;

async function fetchSpotifyAPI(accessToken: string, timeoutMs: number): Promise<FetchResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${accessToken}` },
      signal: controller.signal
    });
    const status = response.status;

    if (status === 204) {
      return { type: 'success', status, data: null };
    }

    if (!response.ok) {
      return { type: 'http_error', status };
    }

    // Parse JSON within the same timeout context - handle AbortError separately
    let data: unknown;
    try {
      data = await response.json();
    } catch (jsonErr) {
      // Check if this was a timeout/abort during JSON parsing
      if (jsonErr instanceof Error && jsonErr.name === 'AbortError') {
        console.error('[Edge] Spotify response parsing timed out');
        return { type: 'timeout' };
      }
      console.error('[Edge] Spotify response JSON parse error');
      return { type: 'parse_error' };
    }

    return { type: 'success', status, data };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.error('[Edge] Spotify request timed out');
      return { type: 'timeout' };
    }
    console.error('[Edge] Spotify request network error');
    return { type: 'network_error' };
  } finally {
    clearTimeout(timeoutId);
  }
}

type TokenRefreshResult =
  | { type: 'invalid_refresh_token' }
  | { type: 'decryption_error' }
  | { type: 'missing_credentials' }
  | { type: 'http_error'; status: number; message: string }
  | { type: 'network_error' }
  | { type: 'timeout' }
  | { type: 'parse_error' }
  | { type: 'invalid_token' }
  | { type: 'database_error' }
  | { type: 'encryption_error' }
  | { type: 'success'; newAccessToken: string };

async function refreshToken(connection: {
  id: string;
  refresh_token_encrypted: string;
  refresh_token_nonce: string;
  refresh_token_tag: string;
  key_version?: number;
}): Promise<TokenRefreshResult> {
  let refreshTokenStr: string;
  try {
    refreshTokenStr = await decryptToken(
      connection.refresh_token_encrypted,
      connection.refresh_token_nonce,
      connection.refresh_token_tag,
      connection.key_version ?? 1
    );
  } catch {
    // Decryption failure is NOT the same as invalid refresh token from Spotify
    console.error('[Edge] Refresh token decryption failed');
    return { type: 'decryption_error' };
  }

  const clientId = Deno.env.get('SPOTIFY_CLIENT_ID');
  if (!clientId) {
    console.error('[Edge] Spotify client ID not configured');
    return { type: 'missing_credentials' };
  }

  // Token refresh - PKCE public client flow (no client secret)
  // timeout covers entire operation including JSON parsing
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TOKEN_REFRESH_TIMEOUT_MS);

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshTokenStr,
        client_id: clientId
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const status = response.status;

      // Special handling for 400 - check if it's an invalid_grant error
      if (status === 400) {
        let errorBody: { error?: string; error_description?: string } = {};
        try {
          errorBody = await response.json();
        } catch (jsonErr) {
          // If JSON parsing fails due to abort/timeout, return timeout result
          if (jsonErr instanceof Error && jsonErr.name === 'AbortError') {
            console.error('[Edge] Token endpoint response parsing timed out');
            return { type: 'timeout' };
          }
          // For ordinary JSON parsing failures, continue with generic HTTP error handling
        }

        // Check for invalid_grant specifically from Spotify OAuth
        if (errorBody.error === 'invalid_grant') {
          console.error('[Edge] Spotify returned invalid_grant - refresh token expired/invalid');
          return { type: 'invalid_refresh_token' };
        }
      }

      // 401/403 from token endpoint means application credential issues, not user session
      // Map to 500 to hide internal credential problems from the client
      if (status === 401 || status === 403) {
        console.error('[Edge] Token endpoint returned', status, '- application credentials issue');
        return { type: 'http_error', status: 500, message: 'Token service unavailable' };
      }
      if (status === 429) {
        return { type: 'http_error', status, message: 'Too many requests. Please try again later.' };
      }
      console.error('[Edge] Token refresh HTTP error:', status);
      return { type: 'http_error', status, message: 'Token service unavailable' };
    }

    // Parse JSON within timeout context - handle AbortError separately
    let newTokens: unknown;
    try {
      newTokens = await response.json();
    } catch (jsonErr) {
      if (jsonErr instanceof Error && jsonErr.name === 'AbortError') {
        console.error('[Edge] Token refresh response parsing timed out');
        return { type: 'timeout' };
      }
      console.error('[Edge] Token refresh response JSON parse error');
      return { type: 'parse_error' };
    }

    if (!newTokens || typeof newTokens !== 'object') {
      console.error('[Edge] Invalid token refresh response');
      return { type: 'parse_error' };
    }

    const access_token = (newTokens as Record<string, unknown>).access_token;
    const expires_in = (newTokens as Record<string, unknown>).expires_in;

    if (access_token === undefined || typeof access_token !== 'string' || access_token.length === 0) {
      console.error('[Edge] Missing access_token');
      return { type: 'invalid_token' };
    }
    if (expires_in === undefined || typeof expires_in !== 'number' || !Number.isFinite(expires_in) || expires_in <= 0) {
      console.error('[Edge] Missing or invalid expires_in');
      return { type: 'invalid_token' };
    }

    // Validate refresh_token from Spotify response - use existing if missing or invalid
    const refreshTokenFromSpotify = (newTokens as Record<string, unknown>).refresh_token;
    const refreshTokenToUse = (typeof refreshTokenFromSpotify === 'string' && refreshTokenFromSpotify.length > 0)
      ? refreshTokenFromSpotify
      : refreshTokenStr;

    const currentKeyVersion = connection.key_version ?? 1;

    // Encrypt tokens with individual try/catch for the access token
    let encryptedAccess: { ciphertext: string; nonce: string; tag: string; keyVersion: number };
    try {
      encryptedAccess = await encryptToken(access_token, currentKeyVersion);
    } catch {
      console.error('[Edge] Failed to encrypt access token');
      return { type: 'encryption_error' };
    }

    // Encrypt refresh token
    let encryptedRefresh: { ciphertext: string; nonce: string; tag: string; keyVersion: number };
    try {
      encryptedRefresh = await encryptToken(refreshTokenToUse, currentKeyVersion);
    } catch {
      console.error('[Edge] Failed to encrypt refresh token');
      return { type: 'encryption_error' };
    }

    const { error: updateError } = await supabase
      .from('provider_connections')
      .update({
        access_token_encrypted: encryptedAccess.ciphertext,
        access_token_nonce: encryptedAccess.nonce,
        access_token_tag: encryptedAccess.tag,
        key_version: encryptedAccess.keyVersion,
        refresh_token_encrypted: encryptedRefresh.ciphertext,
        refresh_token_nonce: encryptedRefresh.nonce,
        refresh_token_tag: encryptedRefresh.tag,
        expires_at: new Date(Date.now() + expires_in * 1000)
      })
      .eq('id', connection.id);

    if (updateError) {
      console.error('[Edge] Database update failed after token refresh');
      return { type: 'database_error' };
    }

    // Use the validated access_token from Spotify response directly (avoid unnecessary decryption)
    return { type: 'success', newAccessToken: access_token };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.error('[Edge] Token refresh timed out');
      return { type: 'timeout' };
    }
    console.error('[Edge] Token refresh failed');
    return { type: 'network_error' };
  } finally {
    clearTimeout(timeoutId);
  }
}

// Handle token refresh and retry with proper error discrimination
async function tokenRefreshWithRetry(connection: {
  id: string;
  refresh_token_encrypted: string;
  refresh_token_nonce: string;
  refresh_token_tag: string;
  key_version?: number;
}): Promise<Response> {
  const refreshResult = await refreshToken(connection);

  switch (refreshResult.type) {
    case 'invalid_refresh_token':
      // User session expired - ask user to reconnect
      return jsonError('Session expired. Please reconnect your Spotify account', 401);
    case 'decryption_error':
      // Internal credential issue
      return jsonError('Failed to decrypt credentials', 500);
    case 'missing_credentials':
      return jsonError('Server configuration error', 500);
    case 'http_error':
      // HTTP errors (429 rate limit, token service errors, etc.)
      return jsonError(refreshResult.message, refreshResult.status);
    case 'network_error':
      return jsonError('Network error during token refresh', 502);
    case 'timeout':
      return jsonError('Token refresh timed out', 504);
    case 'parse_error':
      return jsonError('Failed to refresh Spotify token', 502);
    case 'invalid_token':
      return jsonError('Invalid token response from Spotify', 502);
    case 'database_error':
      return jsonError('Failed to save refreshed credentials', 500);
    case 'encryption_error':
      return jsonError('Failed to encrypt new tokens', 500);
    case 'success': {
      // Retry with new token - use access_token directly from Spotify response
      const retryResult = await fetchSpotifyAPI(refreshResult.newAccessToken, PROVIDER_TIMEOUT_MS);
      switch (retryResult.type) {
        case 'success':
          if (retryResult.status === 204) {
            return jsonResponse({ data: null, status: 'not_playing' });
          }
          return jsonResponse({ data: retryResult.data });
        case 'http_error':
          console.error('[Edge] Spotify API error on retry:', retryResult.status);
          return jsonError('Spotify API error', retryResult.status);
        case 'network_error':
          return jsonError('Network error communicating with Spotify', 502);
        case 'timeout':
          return jsonError('Request to Spotify timed out during retry', 504);
        case 'parse_error':
          return jsonError('Invalid response from Spotify', 502);
      }
    }
  }
}
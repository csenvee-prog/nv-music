/// <reference lib="deno.ns" />
// supabase/functions/spotify-currently-playing/mod.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decryptToken, encryptToken } from '../_shared/encryption.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const PROVIDER_TIMEOUT_MS = 10000;
const TOKEN_REFRESH_TIMEOUT_MS = 8000;

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type'
      }
    });
  }

  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed. Use GET or OPTIONS.' }),
      { status: 405, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Missing Authorization header' }),
      { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }

  const token = authHeader.split(' ')[1];
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: 'Invalid or expired authentication token' }),
      { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }

  const userId = user.id;

  const { data: connection, error: dbError } = await supabase
    .from('provider_connections')
    .select('id, access_token_encrypted, access_token_nonce, access_token_tag, provider_user_id, provider, expires_at, refresh_token_encrypted, refresh_token_nonce, refresh_token_tag, key_version')
    .eq('user_id', userId)
    .eq('provider', 'spotify')
    .single();

  if (dbError) {
    return new Response(
      JSON.stringify({ error: 'Spotify not connected. Please connect your Spotify account in settings.' }),
      { status: 404, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }

  // Helper with error handling and timeout
  async function callSpotifyAPI(accessToken: string): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

    try {
      const response = await fetch(
        'https://api.spotify.com/v1/me/player/currently-playing',
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          signal: controller.signal
        }
      );
      clearTimeout(timeoutId);
      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('timeout');
      }
      throw err;
    }
  }

  // Decrypt access token
  let accessToken: string;
  try {
    accessToken = await decryptToken(
      connection.access_token_encrypted,
      connection.access_token_nonce,
      connection.access_token_tag,
      connection.key_version ?? 1
    );
  } catch (e) {
    console.error('[Edge] Token decryption failed');
    return new Response(
      JSON.stringify({ error: 'Failed to decrypt credentials' }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }

  // Call Spotify API with proper error handling
  let spotifyResponse: Response;
  try {
    spotifyResponse = await callSpotifyAPI(accessToken);
  } catch (err) {
    if (err instanceof Error && err.message === 'timeout') {
      return new Response(
        JSON.stringify({ error: 'Request to Spotify timed out. Please try again.' }),
        { status: 504, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }
    console.error('[Edge] Network error during Spotify request');
    return new Response(
      JSON.stringify({ error: 'Network error communicating with Spotify' }),
      { status: 502, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }

  // Handle 401 - try token refresh
  if (spotifyResponse.status === 401) {
    if (!connection.refresh_token_encrypted || !connection.refresh_token_nonce || !connection.refresh_token_tag) {
      return new Response(
        JSON.stringify({ error: 'Session expired', details: 'Please reconnect your Spotify account' }),
        { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    let refreshToken: string;
    try {
      refreshToken = await decryptToken(
        connection.refresh_token_encrypted,
        connection.refresh_token_nonce,
        connection.refresh_token_tag,
        connection.key_version ?? 1
      );
    } catch (e) {
      console.error('[Edge] Refresh token decryption failed');
      return new Response(
        JSON.stringify({ error: 'Failed to decrypt refresh token' }),
        { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const clientId = Deno.env.get('SPOTIFY_CLIENT_ID');
    const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      console.error('[Edge] Spotify credentials not configured');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    let refreshResponse: Response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TOKEN_REFRESH_TIMEOUT_MS);

      refreshResponse = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return new Response(
          JSON.stringify({ error: 'Token refresh timed out' }),
          { status: 504, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
        );
      }
      return new Response(
        JSON.stringify({ error: 'Token refresh failed' }),
        { status: 502, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    if (!refreshResponse.ok) {
      return new Response(
        JSON.stringify({ error: 'Session expired', details: 'Please reconnect your Spotify account' }),
        { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // Parse refresh response with error handling
    let newTokens: {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };

    try {
      newTokens = await refreshResponse.json() as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      };
    } catch {
      console.error('[Edge] Failed to parse token refresh response', refreshResponse.status);
      return new Response(
        JSON.stringify({ error: 'Invalid response from Spotify token service' }),
        {
          status: 502,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }

    if (!newTokens.access_token || typeof newTokens.access_token !== 'string' || newTokens.access_token.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid token refresh response' }),
        { status: 502, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // Validate expires_in - use 3600 fallback if missing or invalid
    let expiresInSeconds: number;
    if (newTokens.expires_in === undefined || newTokens.expires_in === null) {
      expiresInSeconds = 3600;
    } else if (typeof newTokens.expires_in !== 'number' || !Number.isFinite(newTokens.expires_in) || newTokens.expires_in <= 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid token refresh response' }),
        { status: 502, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    } else {
      expiresInSeconds = newTokens.expires_in;
    }

    // Encrypt new tokens with controlled error handling
    let encryptedAccess: { ciphertext: string; nonce: string; tag: string; keyVersion: number };
    let encryptedRefresh: { ciphertext: string; nonce: string; tag: string; keyVersion: number };

    try {
      encryptedAccess = await encryptToken(newTokens.access_token, connection.key_version ?? 1);
      const newRefreshToken = newTokens.refresh_token || refreshToken;
      encryptedRefresh = await encryptToken(newRefreshToken, connection.key_version ?? 1);
    } catch (e) {
      console.error('[Edge] Token encryption failed');
      return new Response(
        JSON.stringify({ error: 'Failed to encrypt new tokens' }),
        { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // Update database with check for success
    const { error: updateError } = await supabase
      .from('provider_connections')
      .update({
        access_token_encrypted: encryptedAccess.ciphertext,
        access_token_nonce: encryptedAccess.nonce,
        access_token_tag: encryptedAccess.tag,
        refresh_token_encrypted: encryptedRefresh.ciphertext,
        refresh_token_nonce: encryptedRefresh.nonce,
        refresh_token_tag: encryptedRefresh.tag,
        expires_at: new Date(Date.now() + expiresInSeconds * 1000)
      })
      .eq('id', connection.id);

    if (updateError) {
      console.error('[Edge] Database update failed after token refresh');
      return new Response(
        JSON.stringify({ error: 'Failed to save refreshed credentials' }),
        { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // Decrypt for retry with controlled error handling
    try {
      accessToken = await decryptToken(
        encryptedAccess.ciphertext,
        encryptedAccess.nonce,
        encryptedAccess.tag,
        connection.key_version ?? 1
      );
    } catch (e) {
      return new Response(
        JSON.stringify({ error: 'Failed to process renewed token' }),
        { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // Retry with the same error handling
    try {
      spotifyResponse = await callSpotifyAPI(accessToken);
    } catch (err) {
      if (err instanceof Error && err.message === 'timeout') {
        return new Response(
          JSON.stringify({ error: 'Request to Spotify timed out during retry' }),
          { status: 504, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
        );
      }
      console.error('[Edge] Network error during Spotify retry');
      return new Response(
        JSON.stringify({ error: 'Network error communicating with Spotify during retry' }),
        { status: 502, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }
  }

  if (spotifyResponse.status === 204) {
    return new Response(
      JSON.stringify({ data: null, status: 'not_playing' }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }

  if (!spotifyResponse.ok) {
    return new Response(
      JSON.stringify({ error: 'Spotify API error', status: spotifyResponse.status }),
      { status: spotifyResponse.status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }

  const spotifyData = await spotifyResponse.json();

  return new Response(
    JSON.stringify({ data: spotifyData }),
    { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
  );
});
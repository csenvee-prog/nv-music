/**
 * Spotify OAuth Client
 *
 * Frontend service for initiating and completing Spotify Authorization Code flow with PKCE.
 * Uses the system browser (not an embedded WebView) for the authorization step.
 * No client secret is ever stored or transmitted.
 *
 * Callback architecture (single source of truth):
 * - initiateSpotifyOAuth(): Opens browser, processes callback, exchanges tokens
 * - processCallback(): SINGLE shared callback processor used by both browser callbacks and _layout.tsx
 *
 * The lock in oauth-state.ts ensures single processing - whichever path gets there first
 * successfully consumes the credentials; the other path finds no credentials to process.
 */

import * as WebBrowser from 'expo-web-browser';
import { getSupabase } from './supabase';
import { initiateOAuthFlow, clearAllCredentials, validateStateAndClearAll } from './oauth-state';
import { generateCodeChallenge } from './pkce';

// Spotify scopes - request only the minimum necessary for the initial connection.
// user-read-currently-playing: needed for the currently-playing endpoint.
// user-read-email and user-read-private: needed for profile display.
const SPOTIFY_SCOPES = [
  'user-read-currently-playing',
  'user-read-email',
  'user-read-private',
] as const;

/**
 * Spotify OAuth configuration.
 * The redirect URI must be registered in the Spotify Dashboard.
 */
const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_REDIRECT_URI = 'nvmusic://spotify-callback';
const SPOTIFY_CLIENT_ID = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID;

// Edge Function URL (constructed from Supabase URL)
const getEdgeFunctionUrl = (functionName: string): string => {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://drbbztjvphcmfqztivph.supabase.co';
  return `${supabaseUrl}/functions/v1/${functionName}`;
};

/**
 * Checks if a URL is a Spotify OAuth callback.
 * @param url - The URL to check
 * @returns true if the URL is a Spotify callback, false otherwise
 */
export function isSpotifyCallbackUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    // Protocol must be the custom scheme (nvmusic:)
    if (parsedUrl.protocol !== 'nvmusic:') {
      return false;
    }
    // Hostname must be exactly 'spotify-callback'
    if (parsedUrl.hostname !== 'spotify-callback') {
      return false;
    }
    // Path must be empty (only query params allowed)
    if (parsedUrl.pathname !== '' && parsedUrl.pathname !== '/') {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Builds the Spotify authorization URL.
 * @param codeChallenge - PKCE S256 code challenge
 * @param state - Random state value for CSRF protection
 * @returns Full authorization URL
 */
function buildAuthUrl(codeChallenge: string, state: string): string {
  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID || '',
    response_type: 'code',
    redirect_uri: SPOTIFY_REDIRECT_URI,
    scope: SPOTIFY_SCOPES.join(' '),
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    state: state,
  });

  return `${SPOTIFY_AUTH_URL}?${params.toString()}`;
}

/**
 * Result from the OAuth flow - indicates what happened.
 */
export interface OAuthResult {
  /** Whether the OAuth flow completed successfully with tokens exchanged */
  success: boolean;
  /** Human-readable error message if failed */
  error?: string;
  /** Whether the flow was cancelled by the user */
  cancelled?: boolean;
}

/**
 * Response from Spotify token exchange.
 */
export interface TokenExchangeResponse {
  status: 'success';
  message: string;
  data: {
    expires_in: number;
    token_type: string;
  };
}

/**
 * Error response from Spotify token exchange.
 */
export interface TokenExchangeError {
  status: 'error';
  error: string;
  error_description?: string;
}

export type TokenExchangeResult = TokenExchangeResponse | TokenExchangeError;

/**
 * Processes an incoming Spotify OAuth callback URL.
 * This is the SINGLE shared callback processor that handles:
 * - Runtime Linking events (app already open)
 * - Cold-start deep links (app launched via callback URL)
 * - In-app browser callbacks
 *
 * Security: Uses the lock in oauth-state.ts to ensure exactly one path can consume
 * the PKCE credentials. If credentials are already consumed, returns false (not a callback).
 *
 * @param callbackUrl - The Spotify OAuth callback URL
 * @returns true if token exchange succeeded, 'cancelled' if user cancelled, false if already processed
 * @throws on validation errors or token exchange failures
 */
export async function processCallback(callbackUrl: string): Promise<true | 'cancelled' | false> {
  const params = new URL(callbackUrl).searchParams;
  const receivedState = params.get('state');
  const error_param = params.get('error');
  const code = params.get('code');
  const errorDescription = params.get('error_description');

  // Handle Spotify OAuth errors
  if (error_param) {
    if (error_param === 'access_denied') {
      // User cancelled - validate and consume state if present
      if (receivedState) {
        const codeVerifier = await validateStateAndClearAll(receivedState);
        if (codeVerifier) {
          return 'cancelled';
        }
      } else {
        await clearAllCredentials();
      }
      return 'cancelled';
    }
    // Other OAuth errors - consume credentials and throw
    if (receivedState) {
      const codeVerifier = await validateStateAndClearAll(receivedState);
      if (!codeVerifier) {
        return false; // Not our OAuth session
      }
    } else {
      await clearAllCredentials();
    }
    throw new Error(errorDescription || error_param);
  }

  // No code in URL - check if it's our session
  if (!code) {
    // Check if we have state - might be our session but incomplete
    if (receivedState) {
      const codeVerifier = await validateStateAndClearAll(receivedState);
      if (!codeVerifier) {
        return false; // Not our OAuth session
      }
      // Got state but no code - something went wrong
      throw new Error('No authorization code received from Spotify');
    }
    // Check for any leftover credentials (cleanup)
    await clearAllCredentials();
    return false;
  }

  if (!receivedState) {
    await clearAllCredentials();
    throw new Error('Missing state parameter - possible CSRF attack or expired session');
  }

  // Validate state and retrieve PKCE verifier
  const codeVerifier = await validateStateAndClearAll(receivedState);
  if (!codeVerifier) {
    return false; // Not our OAuth session (credentials already consumed or invalid)
  }

  // Exchange the authorization code for tokens
  const exchangeResult = await exchangeSpotifyToken(code, codeVerifier);

  if (exchangeResult.status === 'error') {
    throw new Error(exchangeResult.error_description || exchangeResult.error);
  }

  return true;
}

/**
 * Initiates the Spotify OAuth flow.
 * Opens the system browser for user authorization and processes the callback.
 *
 * This function handles the complete flow:
 * 1. Initiates PKCE flow (generates and stores verifier/state in SecureStore)
 * 2. Opens Spotify's authorization page in the browser
 * 3. Receives callback and validates it
 * 4. Exchanges code for tokens
 * 5. Returns result indicating success or failure
 *
 * @returns OAuthResult indicating success or failure
 */
export async function initiateSpotifyOAuth(): Promise<OAuthResult> {
  if (!SPOTIFY_CLIENT_ID) {
    return { success: false, error: 'Spotify client ID not configured. Set EXPO_PUBLIC_SPOTIFY_CLIENT_ID in your .env file.' };
  }

  // Generate and store PKCE credentials
  const { codeVerifier, state } = await initiateOAuthFlow();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const authUrl = buildAuthUrl(codeChallenge, state);

  // Open in system browser - not an embedded WebView
  const result = await WebBrowser.openAuthSessionAsync(authUrl, SPOTIFY_REDIRECT_URI);

  if (result.type === 'cancel') {
    await clearAllCredentials();
    return { success: false, cancelled: true };
  }

  if (result.type !== 'success') {
    await clearAllCredentials();
    return { success: false, error: 'OAuth flow failed to complete' };
  }

  // Process the callback - validate state and exchange tokens
  try {
    const processResult = await processCallback(result.url);

    if (processResult === 'cancelled') {
      return { success: false, cancelled: true };
    }

    if (processResult === false) {
      return { success: false, error: 'OAuth callback processed by another instance' };
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

/**
 * Exchanges the authorization code for access/refresh tokens via the Supabase Edge Function.
 * This completes the OAuth flow by calling the token exchange endpoint.
 *
 * @param code - Authorization code from Spotify callback
 * @param codeVerifier - PKCE code verifier
 * @returns Token exchange result with success/error status
 */
export async function exchangeSpotifyToken(code: string, codeVerifier: string): Promise<TokenExchangeResult> {
  // Get current Supabase session
  const supabase = getSupabase();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return {
      status: 'error',
      error: 'not_authenticated',
      error_description: 'User must be logged in to connect Spotify.'
    };
  }

  // Call the Edge Function
  try {
    const response = await fetch(getEdgeFunctionUrl('spotify-token-exchange'), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
        code_verifier: codeVerifier,
        code_challenge_method: 'S256',
      }),
    });

    const result = (await response.json()) as TokenExchangeResult;

    return result;
  } catch (error) {
    console.error('[spotify-oauth] Token exchange failed:', error);
    return {
      status: 'error',
      error: 'network_error',
      error_description: 'Failed to communicate with the server.'
    };
  }
}

/**
 * Gets the redirect URI that must be registered in the Spotify Dashboard.
 * @returns The redirect URI
 */
export function getRedirectUri(): string {
  return SPOTIFY_REDIRECT_URI;
}

/**
 * Gets the configured Spotify client ID.
 * @returns The client ID or null if not configured
 */
export function getSpotifyClientId(): string | null {
  return SPOTIFY_CLIENT_ID || null;
}

/**
 * Checks if Spotify OAuth is configured.
 */
export function isSpotifyConfigured(): boolean {
  return !!SPOTIFY_CLIENT_ID;
}
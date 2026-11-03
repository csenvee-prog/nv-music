/// <reference lib="deno.ns" />
// supabase/functions/spotify-token-exchange/mod.ts
//
// Supabase Edge Function for Spotify OAuth token exchange
// Exchanges authorization code for access/refresh tokens and stores them encrypted
// Uses PKCE public client flow - NO client secret required
//
// SECURITY: This function requires JWT verification and service_role privileges.
// It must be called from authenticated frontend sessions.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decryptToken, encryptToken } from '../_shared/encryption.ts';

// Supabase client with service role for server-side operations
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const SPOTIFY_TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';

interface TokenExchangeRequest {
  code: string;           // Authorization code from Spotify callback
  code_verifier: string;  // PKCE code verifier (for validation)
}

interface TokenExchangeResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

interface ErrorResponse {
  error: string;
  error_description?: string;
}

type FunctionResponse =
  | ResponseSuccess
  | TokenExchangeError
  | ValidationError
  | UnauthorizedResponse
  | DatabaseError;

interface ResponseSuccess {
  status: 'success';
  message: string;
  data: {
    expires_in: number;
    token_type: string;
  };
}

interface TokenExchangeError {
  status: 'error';
  error: string;
  error_description?: string;
}

interface ValidationError {
  status: 'error';
  error: 'invalid_request';
  error_description: string;
}

interface UnauthorizedResponse {
  status: 'error';
  error: 'unauthorized';
  error_description: string;
}

interface DatabaseError {
  status: 'error';
  error: 'database_error';
  error_description: string;
}

function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
      },
    });
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    const error: ValidationError = {
      status: 'error',
      error: 'invalid_request',
      error_description: 'Method not allowed. Use POST.',
    };
    return jsonResponse(error, 405);
  }

  // Extract and validate Authorization header
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    const error: UnauthorizedResponse = {
      status: 'error',
      error: 'unauthorized',
      error_description: 'Missing or invalid Authorization header',
    };
    return jsonResponse(error, 401);
  }

  const accessToken = authHeader.split(' ')[1];

  // Verify the user session with Supabase
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(accessToken);

  if (authError || !user) {
    const error: UnauthorizedResponse = {
      status: 'error',
      error: 'unauthorized',
      error_description: 'Invalid or expired authentication token',
    };
    return jsonResponse(error, 401);
  }

  // Parse request body
  let requestBody: TokenExchangeRequest;
  try {
    requestBody = await req.json();
  } catch (e) {
    const error: ValidationError = {
      status: 'error',
      error: 'invalid_request',
      error_description: 'Invalid JSON in request body',
    };
    return jsonResponse(error, 400);
  }

  // Validate required fields
  if (!requestBody.code || !requestBody.code_verifier) {
    const error: ValidationError = {
      status: 'error',
      error: 'invalid_request',
      error_description: 'Missing required fields: code and code_verifier are required',
    };
    return jsonResponse(error, 400);
  }

  // Get Spotify client ID from environment (public client flow - no client secret)
  const clientId = Deno.env.get('SPOTIFY_CLIENT_ID');

  if (!clientId) {
    console.error('[token-exchange] Spotify client ID not configured');
    const error: TokenExchangeError = {
      status: 'error',
      error: 'server_error',
      error_description: 'Server configuration error',
    };
    return jsonResponse(error, 500);
  }

  // Exchange authorization code for tokens
  const tokenResult = await exchangeCodeForTokens(requestBody.code, requestBody.code_verifier, clientId);

  if (tokenResult instanceof Error) {
    console.error('[token-exchange] Token exchange failed:', tokenResult.message);
    const error: TokenExchangeError = {
      status: 'error',
      error: 'token_exchange_failed',
      error_description: 'Failed to exchange authorization code for tokens',
    };
    return jsonResponse(error, 500);
  }

  const tokens = tokenResult;

  // Calculate token expiration
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  // Encrypt tokens using the shared encryption module
  let encryptedAccess: { ciphertext: string; nonce: string; tag: string; keyVersion: number };
  let encryptedRefresh: { ciphertext: string; nonce: string; tag: string; keyVersion: number };

  try {
    encryptedAccess = await encryptToken(tokens.access_token, 1);
  } catch (e) {
    console.error('[token-exchange] Failed to encrypt access token:', e);
    const error: TokenExchangeError = {
      status: 'error',
      error: 'encryption_error',
      error_description: 'Failed to encrypt access token',
    };
    return jsonResponse(error, 500);
  }

  try {
    encryptedRefresh = await encryptToken(tokens.refresh_token, 1);
  } catch (e) {
    console.error('[token-exchange] Failed to encrypt refresh token:', e);
    const error: TokenExchangeError = {
      status: 'error',
      error: 'encryption_error',
      error_description: 'Failed to encrypt refresh token',
    };
    return jsonResponse(error, 500);
  }

  // Get Spotify user ID to store provider_user_id
  // For now, we store the user's UUID from Supabase auth as provider_user_id
  // In a full implementation, you might want to fetch Spotify's user ID to link accounts
  const providerUserId = user.id;

  // Store encrypted tokens in provider_connections table
  const { data: existingConnection, error: selectError } = await supabaseAdmin
    .from('provider_connections')
    .select('id')
    .eq('user_id', user.id)
    .eq('provider', 'spotify')
    .single();

  console.log('[token-exchange] Up to date provider_connections:', selectError?.message);

  let upsertError;
  if (!selectError && existingConnection) {
    // Update existing connection
    const { error } = await supabaseAdmin
      .from('provider_connections')
      .update({
        access_token_encrypted: encryptedAccess.ciphertext,
        access_token_nonce: encryptedAccess.nonce,
        access_token_tag: encryptedAccess.tag,
        key_version: encryptedAccess.keyVersion,
        refresh_token_encrypted: encryptedRefresh.ciphertext,
        refresh_token_nonce: encryptedRefresh.nonce,
        refresh_token_tag: encryptedRefresh.tag,
        expires_at: expiresAt,
        provider_user_id: providerUserId,
      })
      .eq('id', existingConnection.id);
    upsertError = error;
  } else {
    // Insert new connection
    const { error } = await supabaseAdmin
      .from('provider_connections')
      .insert({
        user_id: user.id,
        provider: 'spotify',
        provider_user_id: providerUserId,
        access_token_encrypted: encryptedAccess.ciphertext,
        access_token_nonce: encryptedAccess.nonce,
        access_token_tag: encryptedAccess.tag,
        key_version: encryptedAccess.keyVersion,
        refresh_token_encrypted: encryptedRefresh.ciphertext,
        refresh_token_nonce: encryptedRefresh.nonce,
        refresh_token_tag: encryptedRefresh.tag,
        expires_at: expiresAt,
      });
    upsertError = error;
  }

  if (upsertError) {
    console.error('[token-exchange] Database upsert failed:', upsertError.message);
    // Attempt to sanitize error message for client
    const error: DatabaseError = {
      status: 'error',
      error: 'database_error',
      error_description: 'Failed to save credentials',
    };
    return jsonResponse(error, 500);
  }

  // Success response
  const response: ResponseSuccess = {
    status: 'success',
    message: 'Spotify account connected successfully',
    data: {
      expires_in: tokens.expires_in,
      token_type: tokens.token_type,
    },
  };

  return jsonResponse(response, 200);
});

/**
 * Validates PKCE code verifier.
 * In PKCE, the code verifier must be between 43-128 characters and use only
 * the allowed characters: [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
 * The verifier is hashed by Spotify and compared to the challenge.
 */
function validateCodeVerifier(verifier: string): boolean {
  if (!verifier || typeof verifier !== 'string') return false;
  if (verifier.length < 43 || verifier.length > 128) return false;
  // PKCE allows: unreserved characters (A-Z, a-z, 0-9, -, ., _, ~)
  const validPattern = /^[A-Za-z0-9\-._~]+$/;
  return validPattern.test(verifier);
}

/**
 * Exchanges a Spotify authorization code for access and refresh tokens.
 * Uses PKCE public client flow - client_id in request body, no client secret.
 * Returns the tokens on success, or an Error on failure.
 * Note: Spotify validates the code_verifier against the original code_challenge
 * during this exchange - if they don't match (or the verifier is invalid),
 * Spotify will return an error.
 */
async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  clientId: string
): Promise<TokenExchangeResponse | Error> {
  // Validate the code verifier format before sending to Spotify
  if (!validateCodeVerifier(codeVerifier)) {
    return new Error('Invalid code verifier format');
  }

  try {
    const response = await fetch(SPOTIFY_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: Deno.env.get('SPOTIFY_REDIRECT_URI') || 'nvmusic://spotify-callback',
        client_id: clientId,
        code_verifier: codeVerifier,
      }),
    });

    if (!response.ok) {
      const errorBody = (await response.json()) as ErrorResponse;
      return new Error(`Spotify token error: ${errorBody.error} - ${errorBody.error_description || 'Unknown error'}`);
    }

    const data = (await response.json()) as TokenExchangeResponse;

    // Validate required fields
    if (!data.access_token || !data.refresh_token || !data.expires_in) {
      return new Error('Invalid token response from Spotify');
    }

    return data;
  } catch (err) {
    return err instanceof Error ? err : new Error('Network error during token exchange');
  }
}
/**
 * PKCE (Proof Key for Code Exchange) utility for Spotify OAuth.
 *
 * Generates cryptographically secure code verifiers and S256 code challenges
 * compatible with Spotify's Authorization Code flow.
 */

import * as Crypto from 'expo-crypto';

/**
 * Generates a cryptographically secure PKCE code verifier.
 * Per RFC 7636, the verifier must be 43-128 characters of [A-Z]/[a-z]/[0-9]/"-"/"."/"_".
 *
 * Strategy: generate 32 random bytes, base64url-encode them.
 * This produces ~43 characters and is cryptographically strong.
 */
export function generateCodeVerifier(): string {
  const randomBytes = Crypto.getRandomValues(new Uint8Array(32));
  return base64UrlEncode(randomBytes);
}

/**
 * Generates a SHA-256 S256 code challenge from a code verifier.
 * challenge = base64url(sha256(verifier))
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const digest = await Crypto.digest(
    Crypto.CryptoDigestAlgorithm.SHA256,
    new TextEncoder().encode(verifier)
  );
  // expo-crypto returns Uint8Array, but digest can also be ArrayBuffer in newer versions
  // Convert to Uint8Array if needed
  const bytes = digest instanceof Uint8Array
    ? digest
    : new Uint8Array(digest as ArrayBuffer);
  return base64UrlEncode(bytes);
}

/**
 * Generates a cryptographically secure random OAuth state value.
 * Used to prevent CSRF attacks by validating the callback.
 */
export function generateState(): string {
  const randomBytes = Crypto.getRandomValues(new Uint8Array(16));
  return base64UrlEncode(randomBytes);
}

/**
 * Validates that a state value matches the expected value.
 * Constant-time comparison to prevent timing attacks.
 */
export function validateState(received: string, expected: string): boolean {
  if (!received || !expected) return false;
  if (received.length !== expected.length) return false;

  let result = 0;
  for (let i = 0; i < received.length; i++) {
    result |= received.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Base64url encoding (RFC 4648 §5) - no padding, URL-safe characters.
 */
function base64UrlEncode(bytes: Uint8Array): string {
  // Convert to standard base64 first
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  // Convert to base64url: replace +/ with -_, remove padding
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
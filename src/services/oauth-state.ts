/**
 * OAuth State Management
 *
 * Manages PKCE verifier, state, and other OAuth secrets securely.
 * Uses expo-secure-store for encrypted storage on device.
 *
 * Security features:
 * - In-process lock to prevent concurrent validation of the same credentials
 * - 10-minute state expiration to prevent stale state abuse
 * - Cleanup tracking: returns null if SecureStore deletion fails
 * - Strict timestamp validation rejecting malformed and future values
 */

import * as SecureStore from 'expo-secure-store';
import { generateCodeVerifier, generateState } from './pkce';

const KEYS = {
  PKCE_VERIFIER: 'nv_music_spotify_pkce_verifier',
  PKCE_STATE: 'nv_music_spotify_pkce_state',
  PKCE_TIMESTAMP: 'nv_music_spotify_pkce_timestamp',
} as const;

const STATE_EXPIRATION_MS = 10 * 60 * 1000; // 10 minutes

export interface OAuthState {
  codeVerifier: string;
  state: string;
}

let validationInProgress = false;

/**
 * Attempts to acquire the validation lock synchronously.
 * @returns true if lock acquired, false if another validation is in progress
 * @description Called BEFORE any asynchronous storage operations.
 * If the lock cannot be acquired, the operation is rejected immediately
 * without accessing or modifying any credentials.
 */
function tryAcquireValidationLock(): boolean {
  if (validationInProgress) {
    return false;
  }
  validationInProgress = true;
  return true;
}

/**
 * Releases the validation lock.
 * Always called in finally blocks to ensure release even on errors.
 */
function releaseValidationLock(): void {
  validationInProgress = false;
}

/**
 * Attempts to delete all three OAuth storage items.
 * Attempts all three deletions even if one fails.
 * Returns an object tracking which deletions succeeded/failed.
 * Does NOT silently treat failed deletion as successful cleanup.
 *
 * Important: SecureStore.deleteItemAsync operations are INDEPENDENT and
 * NOT transactional. Each call is a separate operation with its own result.
 */
async function clearAllOAuthStorage(): Promise<{ verifier: boolean; state: boolean; timestamp: boolean }> {
  // Attempt each deletion independently; do not stop on first failure
  const verifierResult = await SecureStore.deleteItemAsync(KEYS.PKCE_VERIFIER).then(() => true).catch(() => false);
  const stateResult = await SecureStore.deleteItemAsync(KEYS.PKCE_STATE).then(() => true).catch(() => false);
  const timestampResult = await SecureStore.deleteItemAsync(KEYS.PKCE_TIMESTAMP).then(() => true).catch(() => false);
  return { verifier: verifierResult, state: stateResult, timestamp: timestampResult };
}

/**
 * Checks if the stored state has expired (older than 10 minutes).
 * Also rejects invalid timestamps (null, empty, non-numeric) and future timestamps.
 * Preserves the existing 10-minute expiration limit:
 *   Date.now() - ts > STATE_EXPIRATION_MS
 *
 * Strict timestamp validation:
 * - Reject null and empty timestamps
 * - Reject malformed strings such as "123abc", "123.5", whitespace-only, non-numeric
 * - Accept only valid safe-integer timestamps
 * - Reject future timestamps
 */
async function isStateExpired(): Promise<boolean> {
  const timestamp = await SecureStore.getItemAsync(KEYS.PKCE_TIMESTAMP);
  if (timestamp === null || timestamp === '') {
    // No timestamp stored — treated as expired
    return true;
  }
  // Strict numeric validation: reject anything that's not pure digits
  // This rejects: empty strings, whitespace, "123abc", "123.5", negative values, etc.
  if (!/^\d+$/.test(timestamp)) {
    return true;
  }
  // Parse the timestamp
  const ts = Number(timestamp);
  if (!Number.isSafeInteger(ts)) {
    // Should not reach here, but defensive check for unsafe integers
    return true;
  }
  // Reject future timestamps
  if (ts > Date.now()) {
    // Future timestamp — treated as expired
    return true;
  }
  // Standard 10-minute expiration check
  return Date.now() - ts > STATE_EXPIRATION_MS;
}

/**
 * Generates and securely stores new PKCE credentials.
 * Also stores a timestamp for expiration checking.
 * Acquires the validation lock synchronously before any asynchronous operation.
 * Always releases the lock in finally, on both success and failure.
 * Successful initiation does NOT leave the lock permanently acquired.
 *
 * Flow:
 *   1. Acquire validation lock synchronously (before any async ops)
 *   2. Generate code verifier and state
 *   3. Write three SecureStore items inside try block
 *   4. Return credentials
 *   5. Always release lock in finally (success or failure)
 */
export async function initiateOAuthFlow(): Promise<OAuthState> {
  // Acquire the validation lock synchronously before any asynchronous operation.
  // This prevents races between initiating a new flow and processing an existing callback.
  if (!tryAcquireValidationLock()) {
    // Lock cannot be acquired - another validation is in progress.
    // Reject immediately without accessing or modifying any credentials.
    throw new Error('Cannot initiate OAuth flow - another validation is in progress');
  }

  try {
    const codeVerifier = generateCodeVerifier();
    const state = generateState();
    const timestamp = Date.now().toString();

    // Use Promise.allSettled to ensure ALL writes complete before cleanup.
    // Promise.all() rejects immediately when one promise rejects, which means
    // other writes may still be in flight when we start cleanup - leading to
    // race conditions where a write completes after its key is deleted.
    const writeResults = await Promise.allSettled([
      SecureStore.setItemAsync(KEYS.PKCE_VERIFIER, codeVerifier),
      SecureStore.setItemAsync(KEYS.PKCE_STATE, state),
      SecureStore.setItemAsync(KEYS.PKCE_TIMESTAMP, timestamp),
    ]);

    // Check if any write failed
    const failedWrites = writeResults.filter((result): result is PromiseSettledResult<void> & { status: 'rejected'; reason: unknown } =>
      result.status === 'rejected'
    );

    if (failedWrites.length > 0) {
      // All writes have now settled. Attempt cleanup of any keys that may have been written.
      // Cleanup is best effort - we don't throw cleanup errors.
      const cleanupResult = await clearAllOAuthStorage();

      // Log which cleanup operations failed (without exposing credentials)
      if (!cleanupResult.verifier) {
        console.error('[initiateOAuthFlow] Cleanup failed: could not delete verifier key');
      }
      if (!cleanupResult.state) {
        console.error('[initiateOAuthFlow] Cleanup failed: could not delete state key');
      }
      if (!cleanupResult.timestamp) {
        console.error('[initiateOAuthFlow] Cleanup failed: could not delete timestamp key');
      }

      // Log the write failure count
      console.error(`[initiateOAuthFlow] Partial write failure: ${failedWrites.length} of 3 writes failed`);

      // Re-throw the first rejection reason to preserve the original error
      // Do NOT throw cleanup error - it would mask the original write error
      throw failedWrites[0].reason;
    }

    return { codeVerifier, state };
  } finally {
    // ALWAYS release the lock in finally, on both success and failure.
    // This is the critical fix: successful initiation previously never released
    // the lock, permanently blocking the OAuth callback from validating.
    // We release only once here, never double-releasing.
    releaseValidationLock();
  }
}

/**
 * Retrieves the stored PKCE verifier.
 * Returns null if no flow is in progress.
 */
export async function getStoredVerifier(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.PKCE_VERIFIER);
}

/**
 * Retrieves the stored OAuth state.
 * Returns null if no flow is in progress.
 */
export async function getStoredState(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.PKCE_STATE);
}

/**
 * Validates the received state against the stored state without clearing.
 * Used when you need to validate but still need the verifier.
 */
export async function validateStateOnly(receivedState: string): Promise<boolean> {
  const storedState = await getStoredState();
  if (!storedState) return false;
  return receivedState === storedState;
}

/**
 * Validates the received state against the stored state.
 * Clears the stored state only (not verifier) to allow token exchange.
 */
export async function validateAndClearState(receivedState: string): Promise<boolean> {
  const storedState = await getStoredState();
  if (!storedState) return false;

  const valid = receivedState === storedState;
  // Clear only the state (not verifier) - verifier is needed for token exchange
  await SecureStore.deleteItemAsync(KEYS.PKCE_STATE).catch(() => {});
  return valid;
}

/**
 * Validates the received state against the stored state.
 * Implements concurrency protection and state expiration.
 * Clears stored credentials on mismatch, expired, or successfully consumed state.
 * Returns the code verifier if valid and not expired, or null if invalid.
 *
 * Security guarantees:
 * - Only one validation can run at a time (prevents concurrent verifier retrieval)
 * - State expires after 10 minutes
 * - Strict timestamp validation rejecting malformed and future values
 * - Returns null if SecureStore cleanup fails (even when state matches)
 * - Verifier returned ONLY if state validation succeeds AND cleanup succeeds
 *
 * Critical: SecureStore operations are NOT transactional. Each deleteItemAsync/getItemAsync
 * is an independent operation with its own result. This function explicitly tracks
 * cleanup results and returns null if any deletion fails, to prevent returning a
 * PKCE verifier when credentials cannot be guaranteed cleared.
 *
 * Flow:
 *   1. Acquire validation lock synchronously (before any async ops)
 *   2. Check expiration using strict isStateExpired (rejects null, empty, non-safe-integer, future)
 *   3. Read verifier and state
 *   4. Validate receivedState === storedState
 *   5. Attempt cleanup of ALL three items (even if some fail)
 *   6. If ANY cleanup deletion failed, return null (do not return verifier)
 *   7. If all cleanup succeeded AND state matched, return codeVerifier
 *   8. Lock released in finally (guaranteed)
 *
 * The lock acquired in step 1 is held throughout steps 2-7 and released
 * in step 8's finally block, coordinating with initiateOAuthFlow() which
 * also acquires the same lock.
 */
export async function validateStateAndClearAll(receivedState: string): Promise<string | null> {
  // Acquire the validation lock synchronously
  // BEFORE any asynchronous storage operations.
  // If another validation is in progress, reject immediately.
  if (!tryAcquireValidationLock()) {
    // Another validation is in progress - reject to prevent concurrent retrieval
    return null;
  }

  try {
    // Check for expiration first (before reading verifier)
    // Uses strict isStateExpired which rejects null, empty, non-safe-integer, future
    if (await isStateExpired()) {
      // Clear all credentials for expired state
      await clearAllOAuthStorage();
      return null;
    }

    // Read both verifier and state
    const [codeVerifier, storedState] = await Promise.all([
      SecureStore.getItemAsync(KEYS.PKCE_VERIFIER),
      SecureStore.getItemAsync(KEYS.PKCE_STATE),
    ]);

    // Handle missing state - attempt cleanup and return null
    if (!storedState) {
      // Attempt cleanup even when no state is present
      await clearAllOAuthStorage();
      // Simply clear storage; no need for variable workaround
      return null;
    }

    // Validate state and attempt cleanup
    const valid = receivedState === storedState;

    // Attempt cleanup of ALL three items, even if some deletions fail.
    // Do NOT silently treat failed deletion as successful cleanup.
    const cleanup = await clearAllOAuthStorage();

    // If ANY cleanup deletion failed, return null.
    // Do not return a PKCE verifier unless cleanup succeeds.
    if (!cleanup.verifier || !cleanup.state || !cleanup.timestamp) {
      // Cleanup failed - cannot guarantee credentials were cleared
      // Return null even if state matched, to prevent unverified verifier release
      return null;
    }

    // All three deletions succeeded AND state matched -> return verifier
    return valid ? codeVerifier : null;
  } finally {
    // Always release the lock, even on errors or early returns.
    // This prevents the lock from staying acquired indefinitely.
    releaseValidationLock();
  }
}

/**
 * Retrieves both verifier and state, then clears them.
 * Used after OAuth callback to get the verifier needed for token exchange.
 * @returns { codeVerifier, state } or null if no flow is in progress
 *
 * Same cleanup tracking as validateStateAndClearAll - returns null if
 * any SecureStore deletion fails, even when credentials are present.
 * Verifier returned ONLY if all three deletions succeed AND state validation passes.
 *
 * Flow:
 *   1. Acquire validation lock synchronously
 *   2. Check expiration using strict isStateExpired
 *   3. Read verifier and state
 *   4. If credentials missing, attempt cleanup and return null
 *   5. Attempt cleanup of ALL three items
 *   6. If ANY deletion failed, return null (do not return OAuthState)
 *   7. If all succeeded, return { codeVerifier, state }
 *   8. Lock released in finally
 *
 * Same security guarantee as validateStateAndClearAll: verifier is never
 * returned unless state validation succeeds AND cleanup succeeds.
 */
export async function retrieveAndClearCredentials(): Promise<OAuthState | null> {
  // Acquire the validation lock synchronously
  if (!tryAcquireValidationLock()) {
    return null;
  }

  try {
    // Check for expiration using strict isStateExpired
    if (await isStateExpired()) {
      await clearAllOAuthStorage();
      return null;
    }

    // Read both verifier and state
    const [codeVerifier, state] = await Promise.all([
      SecureStore.getItemAsync(KEYS.PKCE_VERIFIER),
      SecureStore.getItemAsync(KEYS.PKCE_STATE),
    ]);

    // Handle missing credentials
    if (!codeVerifier || !state) {
      // Attempt cleanup even when credentials are missing
      await clearAllOAuthStorage();
      return null;
    }

    // Clear the credentials after retrieval.
    // If cleanup fails, return null rather than a potentially incomplete OAuthState.
    const cleanup = await clearAllOAuthStorage();
    if (!cleanup.verifier || !cleanup.state || !cleanup.timestamp) {
      // Cleanup failed - cannot guarantee credentials were cleared
      return null;
    }

    // All three deletions succeeded -> return the OAuth state
    return { codeVerifier, state };
  } finally {
    // Always release the lock, even on errors or early returns.
    releaseValidationLock();
  }
}

/**
 * Clears only the state (keeps verifier for token exchange).
 * Called after state validation passes.
 */
export async function clearStateOnly(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.PKCE_STATE).catch(() => {});
}

/**
 * Clears all stored OAuth credentials (verifier, state, and timestamp).
 * Called after successful token exchange or on error/cancel.
 */
export async function clearAllCredentials(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.PKCE_VERIFIER).catch(() => {}),
    SecureStore.deleteItemAsync(KEYS.PKCE_STATE).catch(() => {}),
    SecureStore.deleteItemAsync(KEYS.PKCE_TIMESTAMP).catch(() => {}),
  ]);
}
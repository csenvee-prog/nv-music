/// <reference lib="deno.ns" />
// supabase/functions/_shared/encryption.ts

/**
 * AES-256-GCM Encryption/Decryption Helper for Supabase Edge Functions (Deno)
 *
 * Uses the Web Crypto API (crypto.subtle) with environment-based keys.
 * Keys are expected to be stored in Deno secrets as ENCRYPTION_KEY_V1, ENCRYPTION_KEY_V2, etc.
 * Each key must be a 64-character hex string (32 bytes).
 */

export interface EncryptedResult {
  ciphertext: string; // Base64 encoded
  nonce: string;      // Base64 encoded (12 bytes)
  tag: string;        // Base64 encoded (16 bytes auth tag)
  keyVersion: number;
}

/**
 * Converts a hex string to a Uint8Array.
 * Validates that the input contains only valid hexadecimal characters.
 * Throws on malformed Base64 input to prevent silent failures.
 */
function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Invalid hex string: length must be even');
  }
  // Validate that hex contains only valid hexadecimal characters
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error('Hex string contains invalid characters');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Converts a Uint8Array to a Base64 string.
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Converts a Base64 string to a Uint8Array.
 * Throws if input is malformed (invalid Base64 characters or padding).
 */
function base64ToBytes(base64: string): Uint8Array {
  if (!base64) {
    throw new Error('Base64 input is empty');
  }
  // Validate Base64 format (allowing for standard padding)
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw new Error('Invalid Base64 format');
  }
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch (e) {
    throw new Error('Base64 decoding failed');
  }
}

/**
 * Validates that keyVersion is a positive safe integer.
 */
function validateKeyVersion(keyVersion: number): void {
  if (!Number.isSafeInteger(keyVersion) || keyVersion <= 0) {
    throw new Error('Invalid key version');
  }
}

/**
 * Safely converts a Uint8Array to an ArrayBuffer for Web Crypto API compatibility.
 * Required due to TypeScript 6 / Deno 2.9 typed-array compatibility changes.
 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

/**
 * Retrieves the encryption key for the specified version from Deno environment variables.
 */
async function getKey(keyVersion: number): Promise<CryptoKey> {
  const secretName = `ENCRYPTION_KEY_V${keyVersion}`;
  const keyHex = Deno.env.get(secretName);

  if (!keyHex) {
    throw new Error('Encryption key not found');
  }

  if (keyHex.length !== 64) {
    throw new Error('Invalid encryption key length. Expected 64 hex characters (32 bytes).');
  }

  const keyBytes = hexToBytes(keyHex);

  return await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(keyBytes),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts plaintext using AES-256-GCM.
 * Generates a fresh random 12-byte nonce.
 * Web Crypto API appends the 16-byte authentication tag to the ciphertext.
 * We split them so ciphertext and tag are stored separately.
 */
export async function encryptToken(
  plaintext: string,
  keyVersion: number = 1
): Promise<EncryptedResult> {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Plaintext must be a non-empty string');
  }

  validateKeyVersion(keyVersion);

  const cryptoKey = await getKey(keyVersion);

  // Generate a fresh random 12-byte nonce (IV)
  const nonceBytes = crypto.getRandomValues(new Uint8Array(12));

  const encodedText = new TextEncoder().encode(plaintext);

  // Perform AES-GCM encryption (returns ciphertext + 16-byte auth tag combined in Web Crypto)
  const encryptedCombined = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(nonceBytes),
      tagLength: 128 // 128 bits = 16 bytes auth tag
    },
    cryptoKey,
    encodedText
  );

  const combinedBytes = new Uint8Array(encryptedCombined);

  // Web Crypto appends the 16-byte auth tag at the end of the ciphertext
  const tagLength = 16;
  const cipherBytes = combinedBytes.slice(0, combinedBytes.length - tagLength);
  const tagBytes = combinedBytes.slice(combinedBytes.length - tagLength);

  // Defensive: should always pass with proper nonce generation
  if (nonceBytes.length !== 12) {
    throw new Error('Nonces are always 12 bytes with crypto.getRandomValues');
  }
  if (tagBytes.length !== 16) {
    throw new Error('Authentication tags are always 16 bytes with tagLength: 128');
  }

  return {
    ciphertext: bytesToBase64(cipherBytes),
    nonce: bytesToBase64(nonceBytes),
    tag: bytesToBase64(tagBytes),
    keyVersion
  };
}

/**
 * Decrypts ciphertext using AES-256-GCM.
 * Combines ciphertext and authentication tag back together before calling subtle.decrypt.
 * Throws a generic error on decryption failure to avoid exposing key material.
 */
export async function decryptToken(
  ciphertextB64: string,
  nonceB64: string,
  tagB64: string,
  keyVersion: number = 1
): Promise<string> {
  // Validate all inputs are non-empty strings
  if (!ciphertextB64 || typeof ciphertextB64 !== 'string') {
    throw new Error('Invalid ciphertext');
  }
  if (!nonceB64 || typeof nonceB64 !== 'string') {
    throw new Error('Invalid nonce');
  }
  if (!tagB64 || typeof tagB64 !== 'string') {
    throw new Error('Invalid authentication tag');
  }

  validateKeyVersion(keyVersion);

  let cipherBytes: Uint8Array;
  let nonceBytes: Uint8Array;
  let tagBytes: Uint8Array;

  try {
    cipherBytes = base64ToBytes(ciphertextB64);
    nonceBytes = base64ToBytes(nonceB64);
    tagBytes = base64ToBytes(tagB64);
  } catch (e) {
    throw new Error('Invalid input encoding');
  }

  // Validate nonce length (12 bytes = 96 bits is required for AES-GCM)
  if (nonceBytes.length !== 12) {
    throw new Error('Invalid nonce length');
  }

  // Validate tag length (16 bytes = 128 bits is standard for AES-GCM)
  if (tagBytes.length !== 16) {
    throw new Error('Invalid tag length');
  }

  // Validate ciphertext is not empty
  if (cipherBytes.length === 0) {
    throw new Error('Ciphertext is empty');
  }

  // Recombine ciphertext and authentication tag for Web Crypto API
  const combinedBytes = new Uint8Array(cipherBytes.length + tagBytes.length);
  combinedBytes.set(cipherBytes, 0);
  combinedBytes.set(tagBytes, cipherBytes.length);

  try {
    const cryptoKey = await getKey(keyVersion);
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(nonceBytes),
        tagLength: 128
      },
      cryptoKey,
      toArrayBuffer(combinedBytes)
    );

    return new TextDecoder('utf-8', { fatal: true }).decode(decryptedBuffer);
  } catch (err) {
    // AES-GCM authentication failure (tag mismatch) throws a specific error
    // We catch and rethrow generically to avoid leaking key version info
    if (err instanceof Error && err.message.includes('Operation failed')) {
      throw new Error('Decryption failed: authentication error');
    }
    throw new Error('Decryption failed');
  }
}

/**
 * Generates a new cryptographically secure 256-bit encryption key as a 64-character hex string.
 * Useful for provisioning environment secrets.
 */
export function generateEncryptionKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
/// <reference lib="deno.ns" />
// supabase/functions/_shared/encryption.test.ts
// Comprehensive test suite for AES-256-GCM encryption helper

import {
  assert,
  assertStrictEquals,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { encryptToken, decryptToken, generateEncryptionKey } from './encryption.ts';

const TEST_TOKEN = 'test-spotify-access-token-abc123xyz';

/**
 * Helper to decode base64 and return byte length.
 */
function base64Length(b64: string): number {
  return atob(b64).length;
}

/**
 * Helper to decode base64 to a byte array.
 */
function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Helper to encode a byte array to base64.
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Helper to check if string is valid 64-char hex.
 */
function isValidHex64(s: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(s);
}

Deno.test('encryption.ts comprehensive test suite', async () => {
  console.log('=== ENCRYPTION TEST SUITE START ===');

  // Save original environment values for cleanup
  const originalKeyV1 = Deno.env.get('ENCRYPTION_KEY_V1');
  const originalKeyV2 = Deno.env.get('ENCRYPTION_KEY_V2');

  // Generate two different valid keys
  const keyV1 = generateEncryptionKey();
  const keyV2 = generateEncryptionKey();

  assert(isValidHex64(keyV1), 'keyV1 must be 64 hex characters');
  assert(isValidHex64(keyV2), 'keyV2 must be 64 hex characters');
  assert(keyV1 !== keyV2, 'keys must be different');

  // Set up environment
  Deno.env.set('ENCRYPTION_KEY_V1', keyV1);
  Deno.env.set('ENCRYPTION_KEY_V2', keyV2);

  try {
    // Test 1: Encryption/decryption roundtrip
    {
      const encrypted = await encryptToken(TEST_TOKEN, 1);
      const decrypted = await decryptToken(
        encrypted.ciphertext,
        encrypted.nonce,
        encrypted.tag,
        encrypted.keyVersion
      );
      assertStrictEquals(decrypted, TEST_TOKEN, 'Decrypted token must match original');
      assertStrictEquals(encrypted.keyVersion, 1, 'Key version should be 1');
      console.log('PASS: Encryption/decryption roundtrip');
    }

    // Test 2: Nonce is exactly 12 bytes
    {
      const encrypted = await encryptToken(TEST_TOKEN, 1);
      assertStrictEquals(base64Length(encrypted.nonce), 12, 'Nonce must be exactly 12 bytes');
      console.log('PASS: Nonce is 12 bytes');
    }

    // Test 3: Authentication tag is exactly 16 bytes
    {
      const encrypted = await encryptToken(TEST_TOKEN, 1);
      assertStrictEquals(base64Length(encrypted.tag), 16, 'Tag must be exactly 16 bytes');
      console.log('PASS: Authentication tag is 16 bytes');
    }

    // Test 4: Wrong valid key causes decryption failure
    {
      const encrypted = await encryptToken(TEST_TOKEN, 1);
      let errorCaught = false;
      try {
        await decryptToken(encrypted.ciphertext, encrypted.nonce, encrypted.tag, 2);
      } catch (e) {
        errorCaught = e instanceof Error && e.message.includes('Decryption failed');
      }
      assert(errorCaught, 'Decryption with wrong key should fail');
      console.log('PASS: Wrong encryption key causes decryption failure');
    }

    // Test 5: Modified ciphertext causes authentication failure
    {
      const encrypted = await encryptToken(TEST_TOKEN, 1);

      // Decode the ciphertext from Base64 into bytes
      const cipherBytes = base64ToBytes(encrypted.ciphertext);
      // Flip one bit in the first ciphertext byte
      cipherBytes[0] = cipherBytes[0] ^ 0x01;
      // Encode the modified bytes back into Base64
      const modifiedCiphertext = bytesToBase64(cipherBytes);

      let errorCaught = false;
      try {
        await decryptToken(modifiedCiphertext, encrypted.nonce, encrypted.tag, 1);
      } catch (e) {
        errorCaught = e instanceof Error && e.message.includes('Decryption failed');
      }
      assert(errorCaught, 'Modified ciphertext should cause decryption failure');
      console.log('PASS: Modified ciphertext causes authentication failure');
    }

    // Test 6: Invalid key version 0 rejected by encryptToken
    {
      await assertRejects(
        async () => {
          await encryptToken(TEST_TOKEN, 0 as unknown as number);
        },
        Error,
        'Invalid key version'
      );
      console.log('PASS: Key version 0 rejected by encryptToken');
    }

    // Test 7: Invalid key version -1 rejected by encryptToken
    {
      await assertRejects(
        async () => {
          await encryptToken(TEST_TOKEN, -1 as unknown as number);
        },
        Error,
        'Invalid key version'
      );
      console.log('PASS: Key version -1 rejected by encryptToken');
    }

    // Test 8: Invalid key version 1.5 rejected by encryptToken
    {
      await assertRejects(
        async () => {
          await encryptToken(TEST_TOKEN, 1.5 as unknown as number);
        },
        Error,
        'Invalid key version'
      );
      console.log('PASS: Key version 1.5 rejected by encryptToken');
    }

    // Test 9: Invalid key version 0 rejected by decryptToken
    {
      await assertRejects(
        async () => {
          await decryptToken('ciphertext', 'nonce', 'tag', 0 as unknown as number);
        },
        Error,
        'Invalid key version'
      );
      console.log('PASS: Key version 0 rejected by decryptToken');
    }

    // Test 10: Invalid key version -1 rejected by decryptToken
    {
      await assertRejects(
        async () => {
          await decryptToken('ciphertext', 'nonce', 'tag', -1 as unknown as number);
        },
        Error,
        'Invalid key version'
      );
      console.log('PASS: Key version -1 rejected by decryptToken');
    }

    // Test 11: Invalid key version 1.5 rejected by decryptToken
    {
      await assertRejects(
        async () => {
          await decryptToken('ciphertext', 'nonce', 'tag', 1.5 as unknown as number);
        },
        Error,
        'Invalid key version'
      );
      console.log('PASS: Key version 1.5 rejected by decryptToken');
    }

    // Test 12: Malformed hex key is rejected
    {
      Deno.env.set('ENCRYPTION_KEY_V1', 'G'.repeat(64));
      await assertRejects(
        async () => {
          await encryptToken(TEST_TOKEN, 1);
        },
        Error,
        'Hex string contains invalid characters'
      );
      console.log('PASS: Malformed hex key is rejected');
      // Restore valid key
      Deno.env.set('ENCRYPTION_KEY_V1', keyV1);
    }

    // Test 13: generateEncryptionKey returns valid 64-char hex
    {
      const key = generateEncryptionKey();
      assertStrictEquals(key.length, 64, 'Generated key must be 64 characters');
      assert(isValidHex64(key), 'Generated key must be valid hexadecimal');
      console.log('PASS: generateEncryptionKey produces valid 64-char hex');
    }

    // Test 14: Two encryptions of same plaintext produce different ciphertexts
    {
      const encrypted1 = await encryptToken(TEST_TOKEN, 1);
      const encrypted2 = await encryptToken(TEST_TOKEN, 1);

      assert(encrypted1.ciphertext !== encrypted2.ciphertext, 'Same token should produce different ciphertexts');
      assert(encrypted1.nonce !== encrypted2.nonce, 'Nonces should be unique');

      const decrypted1 = await decryptToken(encrypted1.ciphertext, encrypted1.nonce, encrypted1.tag, 1);
      const decrypted2 = await decryptToken(encrypted2.ciphertext, encrypted2.nonce, encrypted2.tag, 1);

      assertStrictEquals(decrypted1, TEST_TOKEN, 'First decryption should succeed');
      assertStrictEquals(decrypted2, TEST_TOKEN, 'Second decryption should succeed');
      console.log('PASS: Two encryptions produce different nonces and ciphertexts');
    }

    console.log('=== ALL TESTS PASSED ===');
  } finally {
    // Restore original environment values
    if (originalKeyV1 === undefined) {
      Deno.env.delete('ENCRYPTION_KEY_V1');
    } else {
      Deno.env.set('ENCRYPTION_KEY_V1', originalKeyV1);
    }
    if (originalKeyV2 === undefined) {
      Deno.env.delete('ENCRYPTION_KEY_V2');
    } else {
      Deno.env.set('ENCRYPTION_KEY_V2', originalKeyV2);
    }
  }
});
import crypto from 'node:crypto';

/**
 * Generates a cryptographically secure random hexadecimal token string.
 * @param bytes Number of bytes to generate (default 32 -> 64 hex chars)
 */
export function generateRandomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Computes a SHA-256 hex digest of a token string.
 * Used to store one-way hashes of refresh tokens and one-time tokens in the database.
 * @param token Plain text token string
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generates a cryptographically secure UUID (v4) string.
 * Used for refresh session family tracking and request IDs.
 */
export function generateUuid(): string {
  return crypto.randomUUID();
}

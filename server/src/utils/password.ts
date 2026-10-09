import bcrypt from 'bcrypt';
import { config } from '../config/index.js';

/**
 * Hashes a plaintext password using bcrypt with configurable work factor.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, config.PASSWORD_HASH_COST);
}

/**
 * Verifies a plaintext password against a stored bcrypt hash in constant time.
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Validates whether a candidate password satisfies configured length and complexity requirements.
 */
export function validatePasswordStrength(password: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < config.PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${config.PASSWORD_MIN_LENGTH} characters long`);
  }

  if (config.PASSWORD_REQUIRE_COMPLEXITY) {
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    if (!/[^a-zA-Z0-9]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

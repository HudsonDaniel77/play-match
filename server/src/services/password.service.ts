import {
  hashPassword,
  comparePassword,
  validatePasswordStrength,
} from '../utils/password.js';
import { ValidationError } from '../utils/app-error.js';

export class PasswordService {
  /**
   * Validates password strength according to configuration rules.
   * Throws ValidationError if the password does not satisfy policies.
   */
  public validateStrength(password: string): void {
    const { isValid, errors } = validatePasswordStrength(password);
    if (!isValid) {
      throw new ValidationError(errors.join('. '), errors);
    }
  }

  /**
   * Hashes password using configured bcrypt cost factor.
   */
  public async hash(password: string): Promise<string> {
    return hashPassword(password);
  }

  /**
   * Compares candidate password against existing bcrypt hash in constant time.
   */
  public async compare(password: string, hash: string): Promise<boolean> {
    return comparePassword(password, hash);
  }
}

export const passwordService = new PasswordService();

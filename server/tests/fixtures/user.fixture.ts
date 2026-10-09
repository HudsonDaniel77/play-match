import { User, type IUserDocument } from '../../src/models/user.model.js';
import { passwordService } from '../../src/services/password.service.js';
import { Roles, type Role } from '../../src/constants/roles.js';
import { UserStatuses, type UserStatus } from '../../src/constants/user-status.js';

export const VALID_TEST_PASSWORD = 'PlayMatch2026!Secure';
export const WEAK_TEST_PASSWORD = 'weak';

export async function createTestUser(overrides: {
  email?: string;
  password?: string;
  name?: string;
  role?: Role;
  status?: UserStatus;
  isEmailVerified?: boolean;
} = {}): Promise<{ user: IUserDocument; rawPassword: string }> {
  const rawPassword = overrides.password || VALID_TEST_PASSWORD;
  const passwordHash = await passwordService.hash(rawPassword);

  const user = await User.create({
    email: overrides.email || `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`,
    passwordHash,
    name: overrides.name || 'Test Player',
    role: overrides.role || Roles.PLAYER,
    status: overrides.status || UserStatuses.ACTIVE,
    isEmailVerified: overrides.isEmailVerified !== undefined ? overrides.isEmailVerified : true,
  });

  return { user, rawPassword };
}

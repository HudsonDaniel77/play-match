import { z } from 'zod';
import { Roles } from '../constants/roles.js';

export const registerSchema = z.object({
  body: z.object({
    email: z.string().trim().email('Invalid email address format'),
    password: z.string().min(1, 'Password is required'),
    name: z.string().trim().min(1, 'Name is required'),
    role: z.enum([Roles.PLAYER, Roles.VENUE_OWNER]).optional(),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().trim().email('Invalid email address format'),
    password: z.string().min(1, 'Password is required'),
  }),
});

export const refreshTokenSchema = z.object({
  body: z
    .object({
      refreshToken: z.string().optional(),
    })
    .optional(),
});

export const logoutSchema = z.object({
  body: z
    .object({
      refreshToken: z.string().optional(),
    })
    .optional(),
});

export const verifyEmailSchema = z.object({
  body: z.object({
    token: z.string().trim().min(1, 'Verification token is required'),
  }),
});

export const resendVerificationSchema = z.object({
  body: z.object({
    email: z.string().trim().email('Invalid email address format'),
  }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().trim().email('Invalid email address format'),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().trim().min(1, 'Password reset token is required'),
    newPassword: z.string().min(1, 'New password is required'),
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(1, 'New password is required'),
  }),
});

export type RegisterInput = z.infer<typeof registerSchema>['body'];
export type LoginInput = z.infer<typeof loginSchema>['body'];
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>['body'];
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>['body'];

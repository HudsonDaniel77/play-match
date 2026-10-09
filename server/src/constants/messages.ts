export const Messages = {
  // Authentication & Credentials
  AUTH_GENERIC_INVALID_CREDENTIALS: 'Invalid email or password',
  AUTH_ACCOUNT_LOCKED: 'Account is temporarily locked due to excessive failed login attempts. Please try again later.',
  AUTH_ACCOUNT_SUSPENDED: 'Your account has been suspended. Please contact support.',
  AUTH_UNAUTHORIZED: 'Authentication required',
  AUTH_TOKEN_EXPIRED: 'Access token has expired',
  AUTH_TOKEN_INVALID: 'Invalid authentication token',
  AUTH_REFRESH_TOKEN_INVALID: 'Invalid or expired refresh token',
  AUTH_TOKEN_REUSE_DETECTED: 'Token reuse detected. All sessions in this family have been revoked for your security.',
  AUTH_LOGOUT_SUCCESS: 'Logged out successfully',
  AUTH_LOGOUT_ALL_SUCCESS: 'All sessions logged out successfully',
  AUTH_REGISTER_SUCCESS: 'User registered successfully',
  AUTH_LOGIN_SUCCESS: 'Logged in successfully',
  
  // Email Verification
  AUTH_EMAIL_VERIFIED_SUCCESS: 'Email verified successfully',
  AUTH_EMAIL_NOT_VERIFIED: 'Email verification is required to perform this action',
  AUTH_RESEND_VERIFICATION_GENERIC: 'If an account with that email exists and is unverified, a verification link has been sent.',
  AUTH_VERIFICATION_TOKEN_INVALID: 'Invalid or expired verification token',
  
  // Password Management
  AUTH_FORGOT_PASSWORD_GENERIC: 'If an account with that email exists, a password reset link has been sent.',
  AUTH_RESET_PASSWORD_SUCCESS: 'Password has been reset successfully',
  AUTH_CHANGE_PASSWORD_SUCCESS: 'Password changed successfully',
  AUTH_RESET_TOKEN_INVALID: 'Invalid or expired password reset token',
  AUTH_CURRENT_PASSWORD_INCORRECT: 'Current password is incorrect',
  
  // User Management & Conflicts
  USER_ALREADY_EXISTS: 'An account with this email address already exists',
  USER_NOT_FOUND: 'User not found',
  FORBIDDEN: 'You do not have permission to perform this action',
  
  // Validation & System
  VALIDATION_ERROR: 'Validation failed',
  NOT_FOUND: 'The requested resource was not found',
  RATE_LIMIT_EXCEEDED: 'Too many requests, please try again later',
  INTERNAL_SERVER_ERROR: 'An unexpected internal server error occurred',
  HEALTH_CHECK_HEALTHY: 'System is healthy',
  DATABASE_DISCONNECTED: 'Database is disconnected',

  // Module 2 Profile & Sports
  SPORT_CREATED_SUCCESS: 'Sport created successfully in catalog',
  SPORT_UPDATED_SUCCESS: 'Sport updated successfully in catalog',
  SPORT_NOT_FOUND: 'The requested sport was not found in catalog',
  SPORT_INACTIVE: 'The selected sport is currently inactive',
  MAX_SPORTS_EXCEEDED: 'Player cannot select more than the maximum allowed number of sports',
  SKILL_BAND_NOT_FOUND: 'Selected skill band does not exist for this sport',
  RATING_LOCKED_AFTER_GAMES: 'Skill band cannot be changed after playing rated games. Rating must be updated via matches.',
  PROFILE_UPDATED_SUCCESS: 'Profile updated successfully',
  PROFILE_NOT_FOUND: 'Profile not found',
  PROFILE_IS_PRIVATE: 'This profile is set to private',
  ONBOARDING_COMPLETED_SUCCESS: 'Onboarding completed successfully',
  ONBOARDING_INCOMPLETE: 'Onboarding is not yet complete. Please finish all required steps and select at least one sport.',
  INVALID_AVAILABILITY: 'Availability slots are invalid, overlap, or do not meet minimum duration requirements',
  INVALID_LOCATION: 'Location coordinates or travel radius are invalid',
  INVALID_TIMEZONE: 'Invalid IANA timezone identifier provided',

  // Module 3 Rating Engine
  MATCH_RESULT_APPLIED_SUCCESS: 'Match result applied successfully',
  MATCH_RESULT_VOIDED_SUCCESS: 'Match result voided successfully',
  MATCH_RESULT_NOT_FOUND: 'Match result not found',
  MATCH_RESULT_ALREADY_VOIDED: 'Match result is already voided',
  CANNOT_VOID_HISTORIC_RESULT: 'Cannot void match result because one or more participants have subsequent rated matches',
  DRAW_NOT_ALLOWED: 'Draws are not permitted for this sport',
  DUPLICATE_PLAYER_IN_MATCH: 'A player cannot appear multiple times or on opposing sides in the same match',
  INVALID_MATCH_SIDES: 'Match must contain exactly two opposing sides with valid player counts',
  PLAYER_RATING_NOT_FOUND: 'One or more players do not possess an active rating track for this sport',
  RATING_EVENT_NOT_FOUND: 'Rating event not found',
  PREVIEW_CALCULATED_SUCCESS: 'Match preview calculations generated successfully',
  LEADERBOARD_FETCHED_SUCCESS: 'Leaderboard retrieved successfully',
  RATINGS_FETCHED_SUCCESS: 'Ratings retrieved successfully',
  HISTORY_FETCHED_SUCCESS: 'Rating history retrieved successfully',
  EXPLANATION_FETCHED_SUCCESS: 'Rating explanation retrieved successfully',
} as const;

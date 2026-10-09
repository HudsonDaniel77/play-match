export const TokenTypes = {
  EMAIL_VERIFICATION: 'email_verification',
  PASSWORD_RESET: 'password_reset',
} as const;

export type TokenType = (typeof TokenTypes)[keyof typeof TokenTypes];

export const ALL_TOKEN_TYPES: readonly TokenType[] = [
  TokenTypes.EMAIL_VERIFICATION,
  TokenTypes.PASSWORD_RESET,
] as const;

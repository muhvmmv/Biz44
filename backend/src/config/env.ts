import dotenv from 'dotenv';
dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (isProduction) {
    throw new Error('JWT_SECRET must be set (at least 16 characters) in production.');
  }
  console.warn(
    '[biz44] WARNING: JWT_SECRET is missing or too short. Using an insecure development secret. ' +
      'Set JWT_SECRET in backend/.env before deploying.'
  );
  return 'biz44-insecure-dev-secret-do-not-use-in-production';
}

export const env = {
  PORT: process.env.PORT || 4000,
  JWT_SECRET: resolveJwtSecret(),
  DATABASE_URL: process.env.DATABASE_URL || '',
  /** Comma-separated list of allowed frontend origins. */
  CORS_ORIGINS: (process.env.CORS_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
};

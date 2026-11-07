export function validateEnv() {
  const isProd = process.env.NODE_ENV === 'production';
  const missing = [];

  if (!process.env.MONGODB_URI) {
    missing.push('MONGODB_URI');
  }

  if (isProd) {
    if (!process.env.JWT_ACCESS_SECRET || process.env.JWT_ACCESS_SECRET === 'supersecretaccesskey') {
      missing.push('JWT_ACCESS_SECRET (must be configured with a strong secret in production)');
    }
    if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET === 'supersecretrefreshkey') {
      missing.push('JWT_REFRESH_SECRET (must be configured with a strong secret in production)');
    }
  }

  if (missing.length > 0) {
    const errorMsg = `[ENV ERROR] Critical environment variables missing or insecure:\n  - ${missing.join('\n  - ')}`;
    if (isProd) {
      console.error(`\x1b[31m✖ ${errorMsg}\x1b[0m`);
      throw new Error(errorMsg);
    } else {
      console.warn(`\x1b[33m⚠ ${errorMsg}\x1b[0m`);
    }
  }
}

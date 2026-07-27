import dotenv from 'dotenv';
dotenv.config({ override: true });

export default {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGODB_URI,
  env: process.env.NODE_ENV || 'development',
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100
  }
};

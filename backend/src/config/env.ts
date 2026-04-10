import dotenv from 'dotenv';

dotenv.config();

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  mongoUri: required('MONGO_URI', 'mongodb://127.0.0.1:27017/lk-daily'),
  jwtSecret: required('JWT_SECRET', 'dev-secret-change-me'),
  adminLogin: required('ADMIN_LOGIN', 'admin'),
  adminPassword: required('ADMIN_PASSWORD', 'admin123'),
  nodeEnv: process.env.NODE_ENV ?? 'development',
};

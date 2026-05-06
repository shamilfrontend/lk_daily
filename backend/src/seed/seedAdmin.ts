import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Admin } from '../models/Admin.js';
import { logger } from '../utils/logger.js';

export async function seedAdminIfEmpty(opts?: { logSkip?: boolean }): Promise<boolean> {
  const count = await Admin.countDocuments();
  if (count > 0) {
    if (opts?.logSkip === true) {
      logger.info('Admin already exists; seed skipped');
    }
    return false;
  }
  const passwordHash = await bcrypt.hash(env.adminPassword, 10);
  await Admin.create({ login: env.adminLogin, passwordHash });
  logger.info('Seeded default admin user from environment variables');
  return true;
}

async function main(): Promise<void> {
  await mongoose.connect(env.mongoUri);
  logger.info('Connected to MongoDB');
  try {
    await seedAdminIfEmpty({ logSkip: true });
  } finally {
    await mongoose.disconnect();
  }
}

void main().catch((err: unknown) => {
  logger.error('seed:admin failed', { err });
  process.exit(1);
});

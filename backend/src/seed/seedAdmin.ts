import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { Admin } from '../models/Admin.js';
import { logger } from '../utils/logger.js';

export async function seedAdminIfEmpty(): Promise<void> {
  const count = await Admin.countDocuments();
  if (count > 0) {
    return;
  }
  const passwordHash = await bcrypt.hash(env.adminPassword, 10);
  await Admin.create({ login: env.adminLogin, passwordHash });
  logger.info('Seeded default admin user from environment variables');
}

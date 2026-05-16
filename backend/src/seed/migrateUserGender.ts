import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';

import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { logger } from '../utils/logger.js';

/** Проставляет gender: male участникам без поля (до включения required в схеме). */
export async function migrateUserGenderIfNeeded(): Promise<number> {
  const result = await User.updateMany(
    { gender: { $exists: false } },
    { $set: { gender: 'male' } },
  );
  const modified = result.modifiedCount ?? 0;
  if (modified > 0) {
    logger.info('Migrated users without gender', { modified });
  }
  return modified;
}

async function main(): Promise<void> {
  await mongoose.connect(env.mongoUri);
  logger.info('Connected to MongoDB');
  try {
    const modified = await migrateUserGenderIfNeeded();
    logger.info(`Migration complete: ${modified} user(s) updated`);
  } finally {
    await mongoose.disconnect();
  }
}

const entryPath = process.argv[1];
const isDirectRun =
  typeof entryPath === 'string' &&
  import.meta.url === pathToFileURL(entryPath).href;

if (isDirectRun) {
  void main().catch((err) => {
    logger.error('Migration failed', { err });
    process.exit(1);
  });
}

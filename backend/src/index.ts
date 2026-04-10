import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { apiRouter } from './routes/api.js';
import { seedAdminIfEmpty } from './seed/seedAdmin.js';
import { logger } from './utils/logger.js';

async function main(): Promise<void> {
  await mongoose.connect(env.mongoUri);
  logger.info('Connected to MongoDB');
  await seedAdminIfEmpty();

  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api', apiRouter);

  app.use(errorHandler);

  app.listen(env.port, () => {
    logger.info(`API listening on http://localhost:${env.port}`);
  });
}

void main().catch((err) => {
  logger.error('Fatal startup error', { err });
  process.exit(1);
});

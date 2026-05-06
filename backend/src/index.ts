import cors from 'cors';
import type { Request } from 'express';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import morgan from 'morgan';

import { env } from './config/env.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { requestIdMiddleware } from './middlewares/requestId.js';
import { apiRouter } from './routes/api.js';
import { seedAdminIfEmpty } from './seed/seedAdmin.js';
import { logger } from './utils/logger.js';

function corsOriginOption(): boolean | string | string[] {
  if (env.corsOrigins.length === 0) {
    return true;
  }
  return env.corsOrigins;
}

morgan.token('request-id', (req: Request) => req.id ?? '-');

const serverStartedAt = Date.now();

async function main(): Promise<void> {
  await mongoose.connect(env.mongoUri);
  logger.info('Connected to MongoDB');
  await seedAdminIfEmpty();

  const app = express();
  app.disable('x-powered-by');
  app.use(requestIdMiddleware);
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cors({ origin: corsOriginOption(), credentials: true }));
  app.use(express.json({ limit: '1mb', strict: true }));
  const accessFormat =
    env.nodeEnv === 'production'
      ? ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :request-id'
      : ':method :url :status :response-time ms :request-id';
  app.use(morgan(accessFormat));

  app.get('/health', (_req, res) => {
    const mongoConnected = mongoose.connection.readyState === 1;
    const body = {
      ok: mongoConnected,
      mongo: mongoConnected ? 'connected' : 'disconnected',
    };
    res.status(mongoConnected ? 200 : 503).json(body);
  });

  app.get('/metrics', (_req, res) => {
    const uptimeSec = Math.floor((Date.now() - serverStartedAt) / 1000);
    res.type('text/plain; version=0.0.4; charset=utf-8');
    res.send(`# HELP lk_daily_uptime_seconds Process uptime\n# TYPE lk_daily_uptime_seconds counter\nlk_daily_uptime_seconds ${uptimeSec}\n`);
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

import cors from 'cors';
import express from 'express';
import { apiRouter } from '../routes/api.js';
import { errorHandler } from '../middlewares/errorHandler.js';

export function createTestApp(): express.Express {
  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '1mb', strict: false }));
  app.use('/api', apiRouter);
  app.use(errorHandler);
  return app;
}

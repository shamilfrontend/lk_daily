import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { Team } from '../models/Team.js';
import { User } from '../models/User.js';
import { PresentationLog } from '../models/PresentationLog.js';

describe('history API (integration)', () => {
  let mongoReplSet: MongoMemoryReplSet;
  let app: Express;
  let teamId: string;

  beforeAll(async () => {
    mongoReplSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, dbName: 'lk-daily-history-test' },
    });
    process.env.MONGO_URI = mongoReplSet.getUri();
    process.env.JWT_SECRET = 'integration-test-jwt-secret-min-32-chars-x';
    process.env.ADMIN_LOGIN = 'adm';
    process.env.ADMIN_PASSWORD = 'pwd12345';

    const { createTestApp } = await import('../test/appFactory.js');
    app = createTestApp();

    await mongoose.connect(process.env.MONGO_URI);

    const team = await Team.create({ name: 'Hist Team' });
    teamId = team._id.toString();
    const u = await User.create({ teamId: team._id, fullName: 'Tester', isActive: true });

    for (let i = 0; i < 5; i++) {
      const d = new Date(Date.UTC(2025, 0, 5 + i, 12, 0, 0));
      await PresentationLog.create({
        teamId: team._id,
        date: d,
        userId: u._id,
        status: 'presented',
      });
    }
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoReplSet) {
      await mongoReplSet.stop();
    }
  });

  it('GET /history returns paginated payload', async () => {
    const res = await request(app).get('/api/history').query({ teamId, page: 1, limit: 2 });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.rows)).toBe(true);
    expect(res.body.rows.length).toBe(2);
    expect(res.body.total).toBe(5);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(2);
  });

  it('GET /history page 2 appends logically older rows', async () => {
    const p1 = await request(app).get('/api/history').query({ teamId, page: 1, limit: 2 });
    const p2 = await request(app).get('/api/history').query({ teamId, page: 2, limit: 2 });
    expect(p1.body.rows[0]._id).not.toBe(p2.body.rows[0]._id);
  });
});

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { Team } from '../models/Team.js';
import { User } from '../models/User.js';
import { QueueOrder } from '../models/QueueOrder.js';
import { Admin } from '../models/Admin.js';
import { PresentationLog } from '../models/PresentationLog.js';
import * as dateHelpers from '../utils/dateHelpers.js';
import { invalidateCalendarCache } from '../services/calendarService.js';

describe('queue API (integration)', () => {
  let mongoServer: MongoMemoryServer;
  let app: Express;
  let teamId: string;
  let userA: string;
  let userB: string;
  let token: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongoServer.getUri();
    process.env.JWT_SECRET = 'integration-test-jwt';
    process.env.ADMIN_LOGIN = 'adm';
    process.env.ADMIN_PASSWORD = 'pwd12345';

    const { createTestApp } = await import('../test/appFactory.js');
    app = createTestApp();

    await mongoose.connect(process.env.MONGO_URI);

    const team = await Team.create({ name: 'Test Team' });
    teamId = team._id.toString();

    const ua = await User.create({ teamId: team._id, fullName: 'Alice', isActive: true });
    const ub = await User.create({ teamId: team._id, fullName: 'Bob', isActive: true });
    userA = ua._id.toString();
    userB = ub._id.toString();

    await QueueOrder.create({
      teamId: team._id,
      userIds: [ua._id, ub._id],
    });

    await Admin.create({
      login: 'adm',
      passwordHash: await bcrypt.hash('pwd12345', 8),
    });

    const loginRes = await request(app).post('/api/auth/login').send({ login: 'adm', password: 'pwd12345' });
    expect(loginRes.status).toBe(200);
    token = loginRes.body.token as string;

    // Фиксируем «сегодня» без fake timers — иначе jsonwebtoken считает JWT просроченным
    vi.spyOn(dateHelpers, 'getMoscowDateString').mockReturnValue('2026-04-13');
    invalidateCalendarCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(dateHelpers, 'getMoscowDateString').mockReturnValue('2026-04-13');
    invalidateCalendarCache();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  it('GET /queue/current returns first presenter', async () => {
    const res = await request(app).get('/api/queue/current').query({ teamId });
    expect(res.status).toBe(200);
    expect(res.body.result.kind).toBe('ok');
    expect(res.body.result.user._id).toBe(userA);
  });

  it('POST /queue/present rotates queue', async () => {
    const res = await request(app)
      .post('/api/queue/present')
      .query({ teamId })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.newUserIds[0]).toBe(userB);
    expect(res.body.newUserIds[1]).toBe(userA);
  });

  it('POST /queue/skip records skip status', async () => {
    invalidateCalendarCache();
    await PresentationLog.deleteMany({ teamId: new mongoose.Types.ObjectId(teamId) });

    vi.restoreAllMocks();
    vi.spyOn(dateHelpers, 'getMoscowDateString').mockReturnValue('2026-04-14');
    invalidateCalendarCache();

    const res = await request(app)
      .post('/api/queue/skip')
      .query({ teamId })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);

    const log = await mongoose.connection.collection('presentationlogs').findOne({
      teamId: new mongoose.Types.ObjectId(teamId),
    });
    expect(log?.status).toBe('skipped');
  });
});

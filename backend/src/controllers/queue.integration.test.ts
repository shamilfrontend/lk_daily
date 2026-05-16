import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

import { Team } from '../models/Team.js';
import { User } from '../models/User.js';
import { QueueOrder } from '../models/QueueOrder.js';
import { Admin } from '../models/Admin.js';
import { PresentationLog } from '../models/PresentationLog.js';
import { QueueDaySubstitution } from '../models/QueueDaySubstitution.js';
import { Vacation } from '../models/Vacation.js';
import * as dateHelpers from '../utils/dateHelpers.js';
import { moscowDateStringToUtc } from '../utils/dateHelpers.js';
import { invalidateCalendarCache } from '../services/calendarService.js';

describe('queue API (integration)', () => {
  let mongoReplSet: MongoMemoryReplSet;
  let app: Express;
  let teamId: string;
  let userA: string;
  let userB: string;
  let token: string;

  beforeAll(async () => {
    mongoReplSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, dbName: 'lk-daily-test' },
    });
    process.env.MONGO_URI = mongoReplSet.getUri();
    process.env.JWT_SECRET = 'integration-test-jwt-secret-min-32-chars-x';
    process.env.ADMIN_LOGIN = 'adm';
    process.env.ADMIN_PASSWORD = 'pwd12345';

    const { createTestApp } = await import('../test/appFactory.js');
    app = createTestApp();

    await mongoose.connect(process.env.MONGO_URI);

    const team = await Team.create({ name: 'Test Team' });
    teamId = team._id.toString();

    const ua = await User.create({
      teamId: team._id,
      fullName: 'Alice',
      gender: 'female',
      isActive: true,
    });
    const ub = await User.create({
      teamId: team._id,
      fullName: 'Bob',
      gender: 'male',
      isActive: true,
    });
    userA = ua._id.toString();
    userB = ub._id.toString();

    await QueueOrder.create({
      teamId: team._id,
      members: [
        { userId: ua._id, active: true },
        { userId: ub._id, active: true },
      ],
    });

    await Admin.create({
      login: 'adm',
      passwordHash: await bcrypt.hash('pwd12345', 8),
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ login: 'adm', password: 'pwd12345' });
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
    if (mongoReplSet) {
      await mongoReplSet.stop();
    }
  });

  it('GET /queue/current returns first presenter', async () => {
    const res = await request(app).get('/api/queue/current').query({ teamId });
    expect(res.status).toBe(200);
    expect(res.body.result.kind).toBe('ok');
    expect(res.body.result.user._id).toBe(userA);
    expect(res.body.insights).toEqual({
      vacationUserIds: [],
      maternityUserIds: [],
      sickLeaveUserIds: [],
    });
    expect(res.body.alreadyRecordedToday).toBe(false);
  });

  it('POST /queue/present rotates queue', async () => {
    const res = await request(app)
      .post('/api/queue/present')
      .query({ teamId })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.newUserIds[0]).toBe(userB);
    expect(res.body.newUserIds[1]).toBe(userA);

    const cur = await request(app).get('/api/queue/current').query({ teamId });
    expect(cur.status).toBe(200);
    expect(cur.body.alreadyRecordedToday).toBe(true);
  });

  it('POST /queue/skip cycles through three members without swapping only two', async () => {
    invalidateCalendarCache();
    await PresentationLog.deleteMany({
      teamId: new mongoose.Types.ObjectId(teamId),
    });

    const userC = (
      await User.create({
        teamId: new mongoose.Types.ObjectId(teamId),
        fullName: 'Carol',
        gender: 'female',
        isActive: true,
      })
    )._id.toString();

    await QueueOrder.updateOne(
      { teamId: new mongoose.Types.ObjectId(teamId) },
      {
        $set: {
          members: [
            { userId: new mongoose.Types.ObjectId(userA), active: true },
            { userId: new mongoose.Types.ObjectId(userB), active: true },
            { userId: new mongoose.Types.ObjectId(userC), active: true },
          ],
        },
      },
    );

    vi.restoreAllMocks();
    vi.spyOn(dateHelpers, 'getMoscowDateString').mockReturnValue('2026-04-17');
    invalidateCalendarCache();

    const skipOnce = await request(app)
      .post('/api/queue/skip')
      .query({ teamId })
      .set('Authorization', `Bearer ${token}`);
    expect(skipOnce.status).toBe(200);
    const afterOne = await request(app)
      .get('/api/queue/current')
      .query({ teamId });
    expect(afterOne.body.result.user._id).toBe(userB);

    const skipTwice = await request(app)
      .post('/api/queue/skip')
      .query({ teamId })
      .set('Authorization', `Bearer ${token}`);
    expect(skipTwice.status).toBe(200);
    const afterTwo = await request(app)
      .get('/api/queue/current')
      .query({ teamId });
    expect(afterTwo.body.result.user._id).toBe(userC);
  });

  it('POST /queue/skip promotes queue without journal entry', async () => {
    invalidateCalendarCache();
    await PresentationLog.deleteMany({
      teamId: new mongoose.Types.ObjectId(teamId),
    });
    await QueueOrder.updateOne(
      { teamId: new mongoose.Types.ObjectId(teamId) },
      {
        $set: {
          members: [
            { userId: new mongoose.Types.ObjectId(userA), active: true },
            { userId: new mongoose.Types.ObjectId(userB), active: true },
          ],
        },
      },
    );

    vi.restoreAllMocks();
    vi.spyOn(dateHelpers, 'getMoscowDateString').mockReturnValue('2026-04-14');
    invalidateCalendarCache();

    const res = await request(app)
      .post('/api/queue/skip')
      .query({ teamId })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.newUserIds[0]).toBe(userB);
    expect(res.body.newUserIds[1]).toBe(userA);

    const log = await PresentationLog.findOne({
      teamId: new mongoose.Types.ObjectId(teamId),
    });
    expect(log).toBeNull();

    const cur = await request(app).get('/api/queue/current').query({ teamId });
    expect(cur.status).toBe(200);
    expect(cur.body.alreadyRecordedToday).toBe(false);
    expect(cur.body.result.kind).toBe('ok');
    expect(cur.body.result.user._id).toBe(userB);

    const presentRes = await request(app)
      .post('/api/queue/present')
      .query({ teamId })
      .set('Authorization', `Bearer ${token}`);

    expect(presentRes.status).toBe(200);

    const logAfterPresent = await PresentationLog.findOne({
      teamId: new mongoose.Types.ObjectId(teamId),
    });
    expect(logAfterPresent?.status).toBe('presented');

    const curAfter = await request(app)
      .get('/api/queue/current')
      .query({ teamId });
    expect(curAfter.body.alreadyRecordedToday).toBe(true);
  });

  it('POST /queue/skip advances to next when first in queue is on vacation', async () => {
    invalidateCalendarCache();
    await PresentationLog.deleteMany({
      teamId: new mongoose.Types.ObjectId(teamId),
    });
    await QueueDaySubstitution.deleteMany({
      teamId: new mongoose.Types.ObjectId(teamId),
    });
    await Vacation.deleteMany({});

    const userC = (
      await User.create({
        teamId: new mongoose.Types.ObjectId(teamId),
        fullName: 'Carol',
        gender: 'female',
        isActive: true,
      })
    )._id.toString();

    await QueueOrder.updateOne(
      { teamId: new mongoose.Types.ObjectId(teamId) },
      {
        $set: {
          members: [
            { userId: new mongoose.Types.ObjectId(userA), active: true },
            { userId: new mongoose.Types.ObjectId(userB), active: true },
            { userId: new mongoose.Types.ObjectId(userC), active: true },
          ],
        },
      },
    );

    const dayStart = moscowDateStringToUtc('2026-04-15');
    await Vacation.create({
      userId: new mongoose.Types.ObjectId(userA),
      startDate: dayStart,
      endDate: dayStart,
    });

    vi.restoreAllMocks();
    vi.spyOn(dateHelpers, 'getMoscowDateString').mockReturnValue('2026-04-15');
    invalidateCalendarCache();

    const before = await request(app)
      .get('/api/queue/current')
      .query({ teamId });
    expect(before.body.result.user._id).toBe(userB);

    const res = await request(app)
      .post('/api/queue/skip')
      .query({ teamId })
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    const cur = await request(app).get('/api/queue/current').query({ teamId });
    expect(cur.body.result.user._id).toBe(userC);
  });

  it('POST /queue/skip increments skipDebt; present clears debt', async () => {
    invalidateCalendarCache();
    await PresentationLog.deleteMany({
      teamId: new mongoose.Types.ObjectId(teamId),
    });
    await QueueOrder.updateOne(
      { teamId: new mongoose.Types.ObjectId(teamId) },
      {
        $set: {
          members: [
            { userId: new mongoose.Types.ObjectId(userA), active: true, skipDebt: 0 },
            { userId: new mongoose.Types.ObjectId(userB), active: true, skipDebt: 0 },
          ],
        },
      },
    );

    vi.restoreAllMocks();
    vi.spyOn(dateHelpers, 'getMoscowDateString').mockReturnValue('2026-04-14');
    invalidateCalendarCache();

    const skipRes = await request(app)
      .post('/api/queue/skip')
      .query({ teamId })
      .set('Authorization', `Bearer ${token}`);
    expect(skipRes.status).toBe(200);

    const orderAfterSkip = await request(app)
      .get('/api/queue/order')
      .query({ teamId });
    const memberA = orderAfterSkip.body.members.find(
      (m: { userId: string }) => m.userId === userA,
    );
    expect(memberA?.skipDebt).toBe(1);

    const cur = await request(app).get('/api/queue/current').query({ teamId });
    expect(cur.body.result.user._id).toBe(userB);
    expect(cur.body.result.canonicalSkipDebt).toBe(0);
  });

  it('POST /queue/present clears skipDebt for canonical presenter', async () => {
    invalidateCalendarCache();
    await PresentationLog.deleteMany({
      teamId: new mongoose.Types.ObjectId(teamId),
    });
    await QueueOrder.updateOne(
      { teamId: new mongoose.Types.ObjectId(teamId) },
      {
        $set: {
          members: [
            {
              userId: new mongoose.Types.ObjectId(userA),
              active: true,
              skipDebt: 2,
            },
            { userId: new mongoose.Types.ObjectId(userB), active: true, skipDebt: 0 },
          ],
        },
      },
    );

    vi.restoreAllMocks();
    vi.spyOn(dateHelpers, 'getMoscowDateString').mockReturnValue('2026-04-13');
    invalidateCalendarCache();

    const presentRes = await request(app)
      .post('/api/queue/present')
      .query({ teamId })
      .set('Authorization', `Bearer ${token}`);
    expect(presentRes.status).toBe(200);

    const orderAfterPresent = await request(app)
      .get('/api/queue/order')
      .query({ teamId });
    const memberA = orderAfterPresent.body.members.find(
      (m: { userId: string }) => m.userId === userA,
    );
    expect(memberA?.skipDebt).toBe(0);
  });

  it('POST /queue/skip keeps substitution but shows next when canonical changes', async () => {
    invalidateCalendarCache();
    await PresentationLog.deleteMany({
      teamId: new mongoose.Types.ObjectId(teamId),
    });

    const userC = (
      await User.create({
        teamId: new mongoose.Types.ObjectId(teamId),
        fullName: 'Carol',
        gender: 'female',
        isActive: true,
      })
    )._id.toString();

    await QueueOrder.updateOne(
      { teamId: new mongoose.Types.ObjectId(teamId) },
      {
        $set: {
          members: [
            { userId: new mongoose.Types.ObjectId(userA), active: true },
            { userId: new mongoose.Types.ObjectId(userB), active: true },
            { userId: new mongoose.Types.ObjectId(userC), active: true },
          ],
        },
      },
    );

    const moscowDate = '2026-04-16';
    await QueueDaySubstitution.create({
      teamId: new mongoose.Types.ObjectId(teamId),
      moscowDate,
      canonicalUserId: new mongoose.Types.ObjectId(userA),
      substituteUserId: new mongoose.Types.ObjectId(userC),
    });

    vi.restoreAllMocks();
    vi.spyOn(dateHelpers, 'getMoscowDateString').mockReturnValue(moscowDate);
    invalidateCalendarCache();

    const before = await request(app)
      .get('/api/queue/current')
      .query({ teamId });
    expect(before.body.result.user._id).toBe(userC);

    const res = await request(app)
      .post('/api/queue/skip')
      .query({ teamId })
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    const sub = await QueueDaySubstitution.findOne({
      teamId: new mongoose.Types.ObjectId(teamId),
      moscowDate,
    });
    expect(sub).not.toBeNull();

    const cur = await request(app).get('/api/queue/current').query({ teamId });
    expect(cur.body.result.user._id).toBe(userB);
    expect(cur.body.result.substitution).toBeUndefined();
  });

  it('GET /queue/substitutions validates from/to date format', async () => {
    const res = await request(app).get('/api/queue/substitutions').query({
      teamId,
      from: '2026/04/15',
    });
    expect(res.status).toBe(400);
    expect(String(res.body?.message ?? '')).toContain('Invalid from date');
  });

  it('POST /queue/substitutions creates substitution; DELETE removes it', async () => {
    const moscowDate = '2026-04-20';

    const createRes = await request(app)
      .post('/api/queue/substitutions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        teamId,
        moscowDate,
        substituteUserId: userB,
      });

    expect(createRes.status).toBe(200);
    expect(createRes.body.ok).toBe(true);
    expect(createRes.body.substituteUserId).toBe(userB);

    const listRes = await request(app)
      .get('/api/queue/substitutions')
      .query({ teamId });
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body.rows)).toBe(true);
    expect(
      listRes.body.rows.some(
        (r: { moscowDate: string }) => r.moscowDate === moscowDate,
      ),
    ).toBe(true);

    const delRes = await request(app)
      .delete('/api/queue/substitutions')
      .query({ teamId, moscowDate })
      .set('Authorization', `Bearer ${token}`);

    expect(delRes.status).toBe(200);
    expect(delRes.body.deleted).toBe(true);

    const listAfter = await request(app)
      .get('/api/queue/substitutions')
      .query({ teamId });
    expect(
      listAfter.body.rows.some(
        (r: { moscowDate: string }) => r.moscowDate === moscowDate,
      ),
    ).toBe(false);
  });

  it('POST /queue/substitutions without JWT returns 401', async () => {
    const res = await request(app).post('/api/queue/substitutions').send({
      teamId,
      moscowDate: '2026-04-21',
      substituteUserId: userB,
    });
    expect(res.status).toBe(401);
  });
});

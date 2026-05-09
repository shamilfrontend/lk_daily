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
import * as dateHelpers from '../utils/dateHelpers.js';
import { invalidateCalendarCache } from '../services/calendarCheckerCache.js';

describe('hooks notify-today (integration)', () => {
  let mongoReplSet: MongoMemoryReplSet;
  let app: Express;
  let teamId: string;
  const fetchSpy = vi.spyOn(globalThis, 'fetch');

  beforeAll(async () => {
    mongoReplSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, dbName: 'lk-daily-hooks-test' },
    });
    process.env.MONGO_URI = mongoReplSet.getUri();
    process.env.JWT_SECRET = 'integration-test-jwt-secret-min-32-chars-x';
    process.env.ADMIN_LOGIN = 'adm';
    process.env.ADMIN_PASSWORD = 'pwd12345';
    process.env.OUTBOUND_WEBHOOK_URL = 'https://example.test/webhook';
    process.env.WEBHOOK_TRIGGER_SECRET = 'hook-secret-test';

    vi.spyOn(dateHelpers, 'getMoscowDateString').mockReturnValue('2026-04-13');
    invalidateCalendarCache();

    const { createTestApp } = await import('../test/appFactory.js');
    app = createTestApp();

    await mongoose.connect(process.env.MONGO_URI);

    const team = await Team.create({ name: 'Hook Team' });
    teamId = team._id.toString();
    const ua = await User.create({
      teamId: team._id,
      fullName: 'Presenter',
      isActive: true,
    });
    await QueueOrder.create({ teamId: team._id, userIds: [ua._id] });

    await Admin.create({
      login: 'adm',
      passwordHash: await bcrypt.hash('pwd12345', 8),
    });

    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  afterEach(() => {
    fetchSpy.mockClear();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    delete process.env.OUTBOUND_WEBHOOK_URL;
    delete process.env.WEBHOOK_TRIGGER_SECRET;
    await mongoose.disconnect();
    if (mongoReplSet) {
      await mongoReplSet.stop();
    }
  });

  it('POST /hooks/notify-today sends outbound payload with secret', async () => {
    const res = await request(app)
      .post('/api/hooks/notify-today')
      .set('Authorization', 'Bearer hook-secret-test')
      .send({ teamId });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0];
    expect(init?.method).toBe('POST');
    const body = JSON.parse(String(init?.body));
    expect(body.text).toContain('Hook Team');
    expect(body.text).toContain('Presenter');
  });

  it('POST /hooks/notify-today rejects wrong secret', async () => {
    const res = await request(app)
      .post('/api/hooks/notify-today')
      .set('Authorization', 'Bearer wrong')
      .send({ teamId });

    expect(res.status).toBe(401);
  });
});

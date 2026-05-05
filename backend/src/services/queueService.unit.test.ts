import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { findFirstPresenterId } from './queueService.js';

describe('findFirstPresenterId', () => {
  it('returns first user not in unavailable set', async () => {
    const a = new mongoose.Types.ObjectId();
    const b = new mongoose.Types.ObjectId();
    const c = new mongoose.Types.ObjectId();
    const order = [a, b, c];
    const unavailable = new Set([a.toString()]);
    const got = await findFirstPresenterId(order, unavailable);
    expect(got?.equals(b)).toBe(true);
  });

  it('returns null when everyone unavailable', async () => {
    const a = new mongoose.Types.ObjectId();
    const order = [a];
    const unavailable = new Set([a.toString()]);
    expect(await findFirstPresenterId(order, unavailable)).toBeNull();
  });
});

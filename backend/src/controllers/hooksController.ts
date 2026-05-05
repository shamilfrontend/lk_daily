import type { Request, Response } from 'express';
import Joi from 'joi';
import mongoose from 'mongoose';

import { env } from '../config/env.js';
import { HttpError } from '../middlewares/errorHandler.js';
import { Team } from '../models/Team.js';
import { getCurrentPresenter } from '../services/queueService.js';

const bodySchema = Joi.object({
  teamId: Joi.string().required(),
});

function assertWebhookAuth(req: Request): void {
  const secret = env.webhookTriggerSecret;
  if (!secret) {
    throw new HttpError(404, 'Not found');
  }
  const auth = req.headers.authorization;
  const bearer =
    typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7).trim() : undefined;
  const headerSecret = req.headers['x-lk-daily-secret'];
  const plain = typeof headerSecret === 'string' ? headerSecret.trim() : undefined;
  const token = bearer ?? plain;
  if (!token || token !== secret) {
    throw new HttpError(401, 'Unauthorized');
  }
}

/** Исходящий webhook: уведомление о сегодняшнем докладчике (для Slack Incoming Webhook и аналогов). */
export async function notifyToday(req: Request, res: Response): Promise<void> {
  assertWebhookAuth(req);
  if (!env.outboundWebhookUrl) {
    throw new HttpError(503, 'OUTBOUND_WEBHOOK_URL is not configured');
  }

  const { error, value } = bodySchema.validate(req.body);
  if (error) {
    throw new HttpError(400, error.message);
  }
  const teamId = value.teamId as string;
  if (!mongoose.isValidObjectId(teamId)) {
    throw new HttpError(400, 'Invalid teamId');
  }

  const team = await Team.findById(teamId).lean();
  if (!team) {
    throw new HttpError(404, 'Team not found');
  }

  const current = await getCurrentPresenter(teamId);
  let text: string;
  if (current.kind === 'non_working') {
    text = `LK Daily — ${team.name}: сегодня нерабочий день (${current.reason}).`;
  } else if (current.kind === 'no_queue' || current.kind === 'no_available') {
    text = `LK Daily — ${team.name}: нет доступного докладчика на сегодня.`;
  } else {
    const sub = current.substitution
      ? ` (подмена вместо ${current.substitution.canonicalFullName})`
      : '';
    text = `LK Daily — ${team.name}: сегодня докладчик — ${current.user.fullName}${sub}.`;
  }

  const outboundUrl = env.outboundWebhookUrl;
  const r = await fetch(outboundUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new HttpError(502, `Webhook delivery failed: ${r.status} ${t.slice(0, 200)}`);
  }

  res.json({ ok: true, delivered: true });
}

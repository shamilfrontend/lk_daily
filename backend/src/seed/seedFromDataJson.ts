import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { PresentationLog } from '../models/PresentationLog.js';
import { Team } from '../models/Team.js';
import { User } from '../models/User.js';
import { Vacation } from '../models/Vacation.js';
import { QueueOrder } from '../models/QueueOrder.js';
import { replaceQueueOrder } from '../services/queueService.js';
import { parseMoscowDayInput, utcDateToMoscowDateString } from '../utils/dateHelpers.js';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Корень репозитория: backend/src/seed → ../../../data.json */
const DEFAULT_DATA_PATH = path.resolve(__dirname, '../../../data.json');

interface SeedVacation {
  start: string;
  end: string;
}

interface SeedMember {
  name: string;
  vacations: SeedVacation[];
  onMaternityLeave?: boolean;
}

interface SeedTeam {
  id?: number;
  name: string;
  members: SeedMember[];
}

interface SeedData {
  teams: SeedTeam[];
}

function parseArgs(argv: string[]): { force: boolean; dataPath: string | undefined } {
  let force = false;
  const positional: string[] = [];
  for (const a of argv) {
    if (a === '--force') {
      force = true;
    } else if (!a.startsWith('-')) {
      positional.push(a);
    }
  }
  return { force, dataPath: positional[0] };
}

function loadSeedData(filePath: string): SeedData {
  const raw = readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw) as unknown;
  if (!data || typeof data !== 'object' || !('teams' in data)) {
    throw new Error('Invalid seed file: expected { teams: [...] }');
  }
  const teams = (data as { teams: unknown }).teams;
  if (!Array.isArray(teams)) {
    throw new Error('Invalid seed file: teams must be an array');
  }
  for (const t of teams) {
    if (!t || typeof t !== 'object') {
      throw new Error('Invalid seed file: each team must be an object');
    }
    const team = t as Record<string, unknown>;
    if (typeof team.name !== 'string' || !team.name.trim()) {
      throw new Error('Invalid seed file: team.name is required');
    }
    if (!Array.isArray(team.members)) {
      throw new Error(`Invalid seed file: team "${team.name}" must have members array`);
    }
    for (const m of team.members) {
      if (!m || typeof m !== 'object') {
        throw new Error('Invalid seed file: each member must be an object');
      }
      const mem = m as Record<string, unknown>;
      if (typeof mem.name !== 'string' || !mem.name.trim()) {
        throw new Error('Invalid seed file: member.name is required');
      }
      if (mem.onMaternityLeave !== undefined && typeof mem.onMaternityLeave !== 'boolean') {
        throw new Error(`Invalid seed file: member "${mem.name}" onMaternityLeave must be a boolean`);
      }
      if (!Array.isArray(mem.vacations)) {
        throw new Error(`Invalid seed file: member "${mem.name}" vacations must be an array`);
      }
      for (const v of mem.vacations) {
        if (!v || typeof v !== 'object') {
          throw new Error('Invalid seed file: each vacation must be an object');
        }
        const vac = v as Record<string, unknown>;
        if (typeof vac.start !== 'string' || typeof vac.end !== 'string') {
          throw new Error('Invalid seed file: vacation start/end must be strings YYYY-MM-DD');
        }
      }
    }
  }
  return data as SeedData;
}

async function wipeTeamRelatedCollections(): Promise<void> {
  await Vacation.deleteMany({});
  await PresentationLog.deleteMany({});
  await QueueOrder.deleteMany({});
  await User.deleteMany({});
  await Team.deleteMany({});
  logger.info('Cleared Team, User, Vacation, QueueOrder, PresentationLog (Admin unchanged)');
}

async function seedFromData(data: SeedData): Promise<void> {
  for (const t of data.teams) {
    const team = await Team.create({ name: t.name.trim() });
    const userIds: mongoose.Types.ObjectId[] = [];

    for (const m of t.members) {
      const user = await User.create({
        fullName: m.name.trim(),
        teamId: team._id,
        isActive: true,
        onMaternityLeave: m.onMaternityLeave === true,
      });
      userIds.push(user._id);

      for (const vac of m.vacations) {
        const startDate = parseMoscowDayInput(vac.start);
        const endDate = parseMoscowDayInput(vac.end);
        if (utcDateToMoscowDateString(startDate) > utcDateToMoscowDateString(endDate)) {
          throw new Error(`Vacation range invalid for ${m.name}: ${vac.start} > ${vac.end}`);
        }
        await Vacation.create({
          userId: user._id,
          startDate,
          endDate,
        });
      }
    }

    await replaceQueueOrder(team._id, userIds);
    logger.info(`Seeded team "${team.name}" with ${userIds.length} members`);
  }
}

async function main(): Promise<void> {
  const { force, dataPath } = parseArgs(process.argv.slice(2));
  const filePath = dataPath ? path.resolve(dataPath) : DEFAULT_DATA_PATH;

  await mongoose.connect(env.mongoUri);
  logger.info('Connected to MongoDB');

  try {
    if (!force && (await Team.countDocuments()) > 0) {
      logger.info('Database already has teams; skip seed (use --force to replace team-related data)');
      return;
    }

    if (force) {
      await wipeTeamRelatedCollections();
    }

    const data = loadSeedData(filePath);
    await seedFromData(data);
    logger.info(`Seed completed from ${filePath}`);
  } finally {
    await mongoose.disconnect();
  }
}

void main().catch((err) => {
  logger.error('Seed failed', { err });
  process.exit(1);
});

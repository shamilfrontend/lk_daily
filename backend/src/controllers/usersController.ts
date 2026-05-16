import type { Request, Response } from 'express';
import Joi from 'joi';
import mongoose from 'mongoose';

import {
  USER_GENDERS,
  type UserGender,
} from '../constants/userGenders.js';
import {
  USER_JOB_ROLES,
  type UserJobRole,
} from '../constants/userJobRoles.js';
import { HttpError } from '../middlewares/errorHandler.js';
import { Team } from '../models/Team.js';
import { User } from '../models/User.js';
import {
  appendUserToQueueEnd,
  removeUserFromQueue,
} from '../services/queueService.js';
import { allowedTeamIdSet, assertTeamAccess } from '../utils/authz.js';

const jobRoleSchema = Joi.string()
  .valid(...USER_JOB_ROLES)
  .allow(null, '');

const genderSchema = Joi.string()
  .valid(...USER_GENDERS)
  .required();

const AVATAR_DATA_URL_RE =
  /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const AVATAR_RAW_BASE64_RE = /^[A-Za-z0-9+/=]+$/;

const avatarSchema = Joi.string()
  .allow(null, '')
  .max(700_000)
  .custom((value, helpers) => {
    if (value == null || value === '') {
      return value;
    }
    if (
      AVATAR_DATA_URL_RE.test(value) ||
      AVATAR_RAW_BASE64_RE.test(value)
    ) {
      return value;
    }
    return helpers.error('any.invalid');
  }, 'avatar format');

const createBody = Joi.object({
  fullName: Joi.string().trim().required(),
  teamId: Joi.string().required(),
  gender: genderSchema,
  avatar: avatarSchema,
  isActive: Joi.boolean().default(true),
  onMaternityLeave: Joi.boolean().default(false),
  onSickLeave: Joi.boolean().default(false),
  jobRole: jobRoleSchema,
  birthday: Joi.string().isoDate().allow(null, ''),
});

const updateBody = Joi.object({
  fullName: Joi.string().trim(),
  teamId: Joi.string(),
  gender: genderSchema,
  avatar: avatarSchema,
  isActive: Joi.boolean(),
  onMaternityLeave: Joi.boolean(),
  onSickLeave: Joi.boolean(),
  jobRole: jobRoleSchema,
  birthday: Joi.string().isoDate().allow(null, ''),
}).min(1);

function parseBirthdayInput(
  value: string | null | undefined,
): Date | undefined {
  if (value == null || value === '') {
    return undefined;
  }
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsed = new Date(isDateOnly ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(400, 'Invalid birthday');
  }
  return parsed;
}

function parseJobRoleInput(
  value: string | null | undefined,
): UserJobRole | undefined {
  if (value == null || value === '') {
    return undefined;
  }
  return value as UserJobRole;
}

function parseGenderInput(value: string): UserGender {
  return value as UserGender;
}

function parseAvatarInput(
  value: string | null | undefined,
): string | undefined {
  if (value == null || value === '') {
    return undefined;
  }
  return value;
}

export async function listUsers(req: Request, res: Response): Promise<void> {
  const teamId = req.query.teamId as string | undefined;
  const allAccessibleTeams = req.query.accessibleTeams === 'all';
  const allowed = allowedTeamIdSet(req.auth);
  const includeInactive = req.query.includeInactive === 'true';
  const filter: Record<string, unknown> = {};

  if (allAccessibleTeams) {
    if (allowed) {
      filter.teamId = { $in: Array.from(allowed) };
    }
  } else if (allowed) {
    if (!teamId || !mongoose.isValidObjectId(teamId)) {
      throw new HttpError(400, 'teamId is required');
    }
    if (!allowed.has(teamId)) {
      throw new HttpError(403, 'Forbidden for this team');
    }
    filter.teamId = teamId;
  } else if (teamId) {
    if (!mongoose.isValidObjectId(teamId)) {
      throw new HttpError(400, 'Invalid teamId');
    }
    filter.teamId = teamId;
  }
  if (!includeInactive) {
    filter.isActive = true;
  }
  const users = await User.find(filter).sort({ fullName: 1 }).lean();
  res.json(users);
}

export async function createUser(req: Request, res: Response): Promise<void> {
  const { error, value } = createBody.validate(req.body);
  if (error) {
    throw new HttpError(400, error.message);
  }
  if (!mongoose.isValidObjectId(value.teamId)) {
    throw new HttpError(400, 'Invalid teamId');
  }
  assertTeamAccess(req.auth, value.teamId as string);
  const team = await Team.findById(value.teamId);
  if (!team) {
    throw new HttpError(404, 'Team not found');
  }
  const user = await User.create({
    fullName: value.fullName,
    teamId: team._id,
    gender: parseGenderInput(value.gender as string),
    avatar: parseAvatarInput(value.avatar as string | null | undefined),
    isActive: value.isActive !== false,
    onMaternityLeave: value.onMaternityLeave === true,
    onSickLeave: value.onSickLeave === true,
    jobRole: parseJobRoleInput(value.jobRole as string | null | undefined),
    birthday: parseBirthdayInput(value.birthday as string | null | undefined),
  });
  if (user.isActive) {
    await appendUserToQueueEnd(team._id, user._id);
  }
  res.status(201).json(user);
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  const { error, value } = updateBody.validate(req.body);
  if (error) {
    throw new HttpError(400, error.message);
  }
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new HttpError(400, 'Invalid id');
  }
  const user = await User.findById(req.params.id);
  if (!user) {
    throw new HttpError(404, 'User not found');
  }
  assertTeamAccess(req.auth, user.teamId.toString());
  const prevTeam = user.teamId;
  const prevActive = user.isActive;

  if (value.teamId) {
    if (!mongoose.isValidObjectId(value.teamId)) {
      throw new HttpError(400, 'Invalid teamId');
    }
    assertTeamAccess(req.auth, value.teamId as string);
    const team = await Team.findById(value.teamId);
    if (!team) {
      throw new HttpError(404, 'Team not found');
    }
    user.teamId = team._id;
  }
  if (value.fullName !== undefined) user.fullName = value.fullName;
  if (value.isActive !== undefined) user.isActive = value.isActive;
  if (value.onMaternityLeave !== undefined)
    user.onMaternityLeave = value.onMaternityLeave;
  if (value.onSickLeave !== undefined) user.onSickLeave = value.onSickLeave;
  if (value.birthday !== undefined) {
    user.birthday =
      parseBirthdayInput(value.birthday as string | null) ?? undefined;
  }
  if (value.jobRole !== undefined) {
    user.jobRole = parseJobRoleInput(value.jobRole as string | null);
  }
  if (value.gender !== undefined) {
    user.gender = parseGenderInput(value.gender as string);
  }
  if (value.avatar !== undefined) {
    user.avatar = parseAvatarInput(value.avatar as string | null);
  }

  await user.save();

  if (!prevTeam.equals(user.teamId)) {
    await removeUserFromQueue(prevTeam, user._id);
    if (user.isActive) {
      await appendUserToQueueEnd(user.teamId, user._id);
    }
  } else {
    if (prevActive && !user.isActive) {
      await removeUserFromQueue(user.teamId, user._id);
    }
    if (!prevActive && user.isActive) {
      await appendUserToQueueEnd(user.teamId, user._id);
    }
  }

  res.json(user);
}

export async function deleteUser(req: Request, res: Response): Promise<void> {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new HttpError(400, 'Invalid id');
  }
  const user = await User.findById(req.params.id);
  if (!user) {
    throw new HttpError(404, 'User not found');
  }
  assertTeamAccess(req.auth, user.teamId.toString());
  user.isActive = false;
  await user.save();
  await removeUserFromQueue(user.teamId, user._id);
  res.json(user);
}

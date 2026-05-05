import type { Request, Response } from 'express';
import Joi from 'joi';
import mongoose from 'mongoose';
import { HttpError } from '../middlewares/errorHandler.js';
import { Team } from '../models/Team.js';
import { User } from '../models/User.js';
import { appendUserToQueueEnd, removeUserFromQueue } from '../services/queueService.js';

const createBody = Joi.object({
  fullName: Joi.string().trim().required(),
  teamId: Joi.string().required(),
  isActive: Joi.boolean().default(true),
  onMaternityLeave: Joi.boolean().default(false),
});

const updateBody = Joi.object({
  fullName: Joi.string().trim(),
  teamId: Joi.string(),
  isActive: Joi.boolean(),
  onMaternityLeave: Joi.boolean(),
}).min(1);

export async function listUsers(req: Request, res: Response): Promise<void> {
  const teamId = req.query.teamId as string | undefined;
  const includeInactive = req.query.includeInactive === 'true';
  const filter: Record<string, unknown> = {};
  if (teamId) {
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
  const team = await Team.findById(value.teamId);
  if (!team) {
    throw new HttpError(404, 'Team not found');
  }
  const user = await User.create({
    fullName: value.fullName,
    teamId: team._id,
    isActive: value.isActive !== false,
    onMaternityLeave: value.onMaternityLeave === true,
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
  const prevTeam = user.teamId;
  const prevActive = user.isActive;

  if (value.teamId) {
    if (!mongoose.isValidObjectId(value.teamId)) {
      throw new HttpError(400, 'Invalid teamId');
    }
    const team = await Team.findById(value.teamId);
    if (!team) {
      throw new HttpError(404, 'Team not found');
    }
    user.teamId = team._id;
  }
  if (value.fullName !== undefined) user.fullName = value.fullName;
  if (value.isActive !== undefined) user.isActive = value.isActive;
  if (value.onMaternityLeave !== undefined) user.onMaternityLeave = value.onMaternityLeave;

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
  user.isActive = false;
  await user.save();
  await removeUserFromQueue(user.teamId, user._id);
  res.json(user);
}

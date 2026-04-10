import type { Request, Response } from 'express';
import Joi from 'joi';
import mongoose from 'mongoose';
import { HttpError } from '../middlewares/errorHandler.js';
import { QueueOrder } from '../models/QueueOrder.js';
import { Team } from '../models/Team.js';
import { User } from '../models/User.js';
import { ensureQueueOrder } from '../services/queueService.js';

const createBody = Joi.object({
  name: Joi.string().trim().required(),
  description: Joi.string().allow('', null),
  region: Joi.string().allow('', null),
});

const updateBody = Joi.object({
  name: Joi.string().trim(),
  description: Joi.string().allow('', null),
  region: Joi.string().allow('', null),
}).min(1);

export async function listTeams(_req: Request, res: Response): Promise<void> {
  const teams = await Team.find().sort({ name: 1 }).lean();
  res.json(teams);
}

export async function createTeam(req: Request, res: Response): Promise<void> {
  const { error, value } = createBody.validate(req.body);
  if (error) {
    throw new HttpError(400, error.message);
  }
  const team = await Team.create({
    name: value.name,
    description: value.description || undefined,
    region: value.region || undefined,
  });
  await ensureQueueOrder(team._id);
  res.status(201).json(team);
}

export async function updateTeam(req: Request, res: Response): Promise<void> {
  const { error, value } = updateBody.validate(req.body);
  if (error) {
    throw new HttpError(400, error.message);
  }
  const team = await Team.findByIdAndUpdate(req.params.id, value, { new: true });
  if (!team) {
    throw new HttpError(404, 'Team not found');
  }
  res.json(team);
}

export async function deleteTeam(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!mongoose.isValidObjectId(id)) {
    throw new HttpError(400, 'Invalid id');
  }
  const team = await Team.findById(id);
  if (!team) {
    throw new HttpError(404, 'Team not found');
  }
  await User.updateMany({ teamId: team._id }, { $set: { isActive: false } });
  await QueueOrder.deleteOne({ teamId: team._id });
  await Team.deleteOne({ _id: team._id });
  res.status(204).send();
}

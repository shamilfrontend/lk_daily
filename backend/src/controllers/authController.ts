import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import Joi from 'joi';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { Admin } from '../models/Admin.js';
import { HttpError } from '../middlewares/errorHandler.js';

const loginBody = Joi.object({
  login: Joi.string().required(),
  password: Joi.string().required(),
});

export async function login(req: Request, res: Response): Promise<void> {
  const { error, value } = loginBody.validate(req.body);
  if (error) {
    throw new HttpError(400, error.message);
  }
  const admin = await Admin.findOne({ login: value.login });
  if (!admin) {
    throw new HttpError(401, 'Invalid credentials');
  }
  const ok = await bcrypt.compare(value.password, admin.passwordHash);
  if (!ok) {
    throw new HttpError(401, 'Invalid credentials');
  }
  const token = jwt.sign(
    { adminId: admin._id.toString(), login: admin.login },
    env.jwtSecret,
    { expiresIn: '24h' },
  );
  res.json({ token });
}

export async function verify(req: Request, res: Response): Promise<void> {
  if (!req.auth) {
    throw new HttpError(401, 'Unauthorized');
  }
  res.json({
    ok: true,
    login: req.auth.login,
    role: req.auth.role,
    teamIds: req.auth.teamIds,
  });
}

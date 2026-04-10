import { Router } from 'express';
import * as authController from '../controllers/authController.js';
import * as historyController from '../controllers/historyController.js';
import * as nonWorkingDaysController from '../controllers/nonWorkingDaysController.js';
import * as queueController from '../controllers/queueController.js';
import * as teamsController from '../controllers/teamsController.js';
import * as usersController from '../controllers/usersController.js';
import * as vacationsController from '../controllers/vacationsController.js';
import { requireAdmin } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const apiRouter = Router();

apiRouter.post('/auth/login', asyncHandler(authController.login));
apiRouter.get('/auth/verify', requireAdmin, asyncHandler(authController.verify));

apiRouter.get('/teams', asyncHandler(teamsController.listTeams));
apiRouter.post('/teams', requireAdmin, asyncHandler(teamsController.createTeam));
apiRouter.put('/teams/:id', requireAdmin, asyncHandler(teamsController.updateTeam));
apiRouter.delete('/teams/:id', requireAdmin, asyncHandler(teamsController.deleteTeam));

apiRouter.get('/users', asyncHandler(usersController.listUsers));
apiRouter.post('/users', requireAdmin, asyncHandler(usersController.createUser));
apiRouter.put('/users/:id', requireAdmin, asyncHandler(usersController.updateUser));
apiRouter.delete('/users/:id', requireAdmin, asyncHandler(usersController.deleteUser));

apiRouter.get('/vacations', asyncHandler(vacationsController.listVacations));
apiRouter.post('/vacations', requireAdmin, asyncHandler(vacationsController.createVacation));
apiRouter.put('/vacations/:id', requireAdmin, asyncHandler(vacationsController.updateVacation));
apiRouter.delete('/vacations/:id', requireAdmin, asyncHandler(vacationsController.deleteVacation));

apiRouter.get('/non-working-days', asyncHandler(nonWorkingDaysController.listNonWorkingDays));
apiRouter.post('/non-working-days', requireAdmin, asyncHandler(nonWorkingDaysController.createCustomNonWorkingDay));
apiRouter.delete('/non-working-days/:id', requireAdmin, asyncHandler(nonWorkingDaysController.deleteNonWorkingDay));

apiRouter.get('/queue/current', asyncHandler(queueController.getCurrent));
apiRouter.get('/queue/order', asyncHandler(queueController.getOrder));
apiRouter.get('/queue/upcoming', asyncHandler(queueController.getUpcoming));
apiRouter.post('/queue/present', requireAdmin, asyncHandler(queueController.present));
apiRouter.post('/queue/skip', requireAdmin, asyncHandler(queueController.skip));
apiRouter.put('/queue/order', requireAdmin, asyncHandler(queueController.putOrder));
apiRouter.post('/queue/sort-alphabetically', requireAdmin, asyncHandler(queueController.sortOrderAlphabetically));

apiRouter.get('/history', asyncHandler(historyController.listHistory));

import rateLimit from 'express-rate-limit';
import { Router } from 'express';
import * as authController from '../controllers/authController.js';
import * as holidayTransfersController from '../controllers/holidayTransfersController.js';
import * as historyController from '../controllers/historyController.js';
import * as hooksController from '../controllers/hooksController.js';
import * as nonWorkingDaysController from '../controllers/nonWorkingDaysController.js';
import * as queueController from '../controllers/queueController.js';
import * as queueSubstitutionsController from '../controllers/queueSubstitutionsController.js';
import * as statsController from '../controllers/statsController.js';
import * as teamsController from '../controllers/teamsController.js';
import * as todayHolidaysController from '../controllers/todayHolidaysController.js';
import * as usersController from '../controllers/usersController.js';
import * as vacationsController from '../controllers/vacationsController.js';
import { env } from '../config/env.js';
import { optionalAuth, requireAdmin } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const apiRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.rateLimitLoginMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.rateLimitApiMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

const exportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.rateLimitExportMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

apiRouter.use(apiLimiter);

apiRouter.post('/auth/login', loginLimiter, asyncHandler(authController.login));
apiRouter.get(
  '/auth/verify',
  asyncHandler(requireAdmin),
  asyncHandler(authController.verify),
);

apiRouter.post(
  '/hooks/notify-today',
  asyncHandler(hooksController.notifyToday),
);

apiRouter.get(
  '/teams',
  asyncHandler(optionalAuth),
  asyncHandler(teamsController.listTeams),
);
apiRouter.post(
  '/teams',
  asyncHandler(requireAdmin),
  asyncHandler(teamsController.createTeam),
);
apiRouter.put(
  '/teams/:id',
  asyncHandler(requireAdmin),
  asyncHandler(teamsController.updateTeam),
);
apiRouter.delete(
  '/teams/:id',
  asyncHandler(requireAdmin),
  asyncHandler(teamsController.deleteTeam),
);

apiRouter.get(
  '/users',
  asyncHandler(optionalAuth),
  asyncHandler(usersController.listUsers),
);
apiRouter.post(
  '/users',
  asyncHandler(requireAdmin),
  asyncHandler(usersController.createUser),
);
apiRouter.put(
  '/users/:id',
  asyncHandler(requireAdmin),
  asyncHandler(usersController.updateUser),
);
apiRouter.delete(
  '/users/:id',
  asyncHandler(requireAdmin),
  asyncHandler(usersController.deleteUser),
);

apiRouter.get(
  '/vacations',
  asyncHandler(optionalAuth),
  asyncHandler(vacationsController.listVacations),
);
apiRouter.post(
  '/vacations',
  asyncHandler(requireAdmin),
  asyncHandler(vacationsController.createVacation),
);
apiRouter.put(
  '/vacations/:id',
  asyncHandler(requireAdmin),
  asyncHandler(vacationsController.updateVacation),
);
apiRouter.delete(
  '/vacations/:id',
  asyncHandler(requireAdmin),
  asyncHandler(vacationsController.deleteVacation),
);

apiRouter.get(
  '/non-working-days',
  asyncHandler(nonWorkingDaysController.listNonWorkingDays),
);

apiRouter.get(
  '/holiday-transfers',
  asyncHandler(holidayTransfersController.listHolidayTransfers),
);
apiRouter.get(
  '/today-holidays',
  asyncHandler(todayHolidaysController.listTodayHolidays),
);

apiRouter.get(
  '/stats/team',
  asyncHandler(requireAdmin),
  asyncHandler(statsController.getTeamStats),
);

apiRouter.get('/queue/current', asyncHandler(queueController.getCurrent));
apiRouter.get('/queue/order', asyncHandler(queueController.getOrder));
apiRouter.get(
  '/queue/upcoming/export/csv',
  exportLimiter,
  asyncHandler(queueController.exportUpcomingCsv),
);
apiRouter.get(
  '/queue/upcoming/export/ics',
  exportLimiter,
  asyncHandler(queueController.exportUpcomingIcs),
);
apiRouter.get('/queue/upcoming', asyncHandler(queueController.getUpcoming));
apiRouter.get(
  '/queue/substitutions',
  asyncHandler(queueSubstitutionsController.listSubstitutions),
);
apiRouter.post(
  '/queue/substitutions',
  asyncHandler(requireAdmin),
  asyncHandler(queueSubstitutionsController.createSubstitution),
);
apiRouter.post(
  '/queue/substitutions/swap-days',
  asyncHandler(requireAdmin),
  asyncHandler(queueSubstitutionsController.swapSubstitutionDays),
);
apiRouter.delete(
  '/queue/substitutions',
  asyncHandler(requireAdmin),
  asyncHandler(queueSubstitutionsController.deleteSubstitution),
);
apiRouter.post(
  '/queue/present',
  asyncHandler(requireAdmin),
  asyncHandler(queueController.present),
);
apiRouter.post(
  '/queue/skip',
  asyncHandler(requireAdmin),
  asyncHandler(queueController.skip),
);
apiRouter.put(
  '/queue/order',
  asyncHandler(requireAdmin),
  asyncHandler(queueController.putOrder),
);
apiRouter.post(
  '/queue/sort-alphabetically',
  asyncHandler(requireAdmin),
  asyncHandler(queueController.sortOrderAlphabetically),
);

apiRouter.get(
  '/history/export/csv',
  exportLimiter,
  asyncHandler(historyController.exportHistoryCsv),
);
apiRouter.get('/history', asyncHandler(historyController.listHistory));

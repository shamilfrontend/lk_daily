// eslint-disable-next-line import/no-extraneous-dependencies
import { expect, test, type Page } from '@playwright/test';

/** Заголовок страницы в контентной области (AppPageHeader → h1.page-title). */
function pageTitleInMain(page: Page) {
  return page.locator('main h1.page-title');
}

const MOCK_TEAM_ID = '507f1f77bcf86cd799439011';
const MOCK_USER_A = '507f1f77bcf86cd799439012';
const MOCK_USER_B = '507f1f77bcf86cd799439013';

/**
 * Мок API без запущенного backend (только для сценария «Выступил»).
 * Перехватывает запросы к `/api/*` до vite-proxy на порт 4000.
 */
async function mockApiForQueueActions(page: Page): Promise<void> {
  /** Нельзя матчить шаблоном вида «любой путь с /api/»: попадётся загрузка `/src/api/client.ts` и сломается бандл. */
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const method = req.method();

    if (method === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        },
      });
      return;
    }

    if (path === '/api/auth/verify') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, login: 'adm', role: 'super', teamIds: [] }),
      });
      return;
    }

    if (path === '/api/teams') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ _id: MOCK_TEAM_ID, name: 'Команда A', region: 'RU-MOW' }]),
      });
      return;
    }

    if (path === '/api/users') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            _id: MOCK_USER_A,
            teamId: MOCK_TEAM_ID,
            fullName: 'Alice',
            isActive: true,
            onMaternityLeave: false,
          },
          {
            _id: MOCK_USER_B,
            teamId: MOCK_TEAM_ID,
            fullName: 'Bob',
            isActive: true,
            onMaternityLeave: false,
          },
        ]),
      });
      return;
    }

    if (path === '/api/vacations') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }

    if (path === '/api/queue/current') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          teamId: MOCK_TEAM_ID,
          result: {
            kind: 'ok',
            userId: MOCK_USER_A,
            user: { _id: MOCK_USER_A, fullName: 'Alice' },
            rotationUserId: MOCK_USER_A,
          },
          insights: { vacationUserIds: [], maternityUserIds: [] },
          alreadyRecordedToday: false,
        }),
      });
      return;
    }

    if (path === '/api/queue/order') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          teamId: MOCK_TEAM_ID,
          members: [
            { userId: MOCK_USER_A, active: true },
            { userId: MOCK_USER_B, active: true },
          ],
        }),
      });
      return;
    }

    if (path === '/api/queue/upcoming') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          teamId: MOCK_TEAM_ID,
          days: 7,
          rows: [{ moscowDate: '2026-05-06', presenter: { _id: MOCK_USER_A, fullName: 'Alice' } }],
        }),
      });
      return;
    }

    if (path === '/api/queue/substitutions') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ teamId: MOCK_TEAM_ID, rows: [] }),
      });
      return;
    }

    if (path === '/api/queue/present' && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ newUserIds: [MOCK_USER_B, MOCK_USER_A] }),
      });
      return;
    }

    if (path === '/api/queue/skip' && method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ newUserIds: [MOCK_USER_B, MOCK_USER_A] }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ message: `Unexpected API call: ${method} ${path}` }),
    });
    },
  );
}

test.describe('оболочка приложения', () => {
  test('главная показывает бренд и заголовок страницы', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('header .app-topbar__brand')).toHaveText('LK Daily');
    await expect(pageTitleInMain(page)).toHaveText('Сегодня');
  });

  test('страница истории открывается', async ({ page }) => {
    await page.route('**/api/teams**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/api/history**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ rows: [], total: 0, page: 1, limit: 50 }),
      });
    });
    await page.goto('/history', { waitUntil: 'domcontentloaded' });
    await expect(pageTitleInMain(page)).toHaveText('История');
  });

  test('история: кнопка «Загрузить ещё» при неполной выборке', async ({ page }) => {
    await page.route('**/api/teams**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/api/history**', async (route) => {
      const u = new URL(route.request().url());
      const pageNum = u.searchParams.get('page') ?? '1';
      const body =
        pageNum === '1'
          ? { rows: [{ _id: '1', teamId: MOCK_TEAM_ID, date: '2026-01-10', userId: null, status: 'presented', createdAt: '' }], total: 3, page: 1, limit: 50 }
          : { rows: [{ _id: '2', teamId: MOCK_TEAM_ID, date: '2026-01-09', userId: null, status: 'skipped', createdAt: '' }], total: 3, page: 2, limit: 50 };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto('/history', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Загрузить ещё' }).click();
    await expect(page.locator('tbody tr')).toHaveCount(2);
  });

  test('админ может отметить выступление на главной (мок API)', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('lk_daily_token', 'e2e-test-token');
    });
    await mockApiForQueueActions(page);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('header .app-topbar__brand')).toBeVisible();
    await expect(page.locator('button', { hasText: 'Выступил' })).toBeEnabled();
    await page.locator('button', { hasText: 'Выступил' }).click();
    await expect(page.locator('.hero-card__title')).toContainText('Alice');
  });
});

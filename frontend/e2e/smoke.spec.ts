import { expect, test, type Page } from '@playwright/test';

/** Заголовок страницы в контентной области (AppPageHeader → h1.page-title). */
function pageTitleInMain(page: Page) {
  return page.locator('main h1.page-title');
}

test.describe('оболочка приложения', () => {
  test('главная показывает бренд и заголовок страницы', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('header .app-topbar__brand')).toHaveText('LK Daily');
    await expect(pageTitleInMain(page)).toHaveText('Сегодня');
  });

  test('страница истории открывается', async ({ page }) => {
    await page.goto('/history', { waitUntil: 'domcontentloaded' });
    await expect(pageTitleInMain(page)).toHaveText('История');
  });
});

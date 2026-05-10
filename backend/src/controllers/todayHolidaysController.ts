import type { Request, Response } from 'express';
import { chromium } from 'playwright';

import { HttpError } from '../middlewares/errorHandler.js';

const HOLIDAYS_SOURCE_URL = 'https://kakoysegodnyaprazdnik.ru/';
const NAVIGATION_TIMEOUT_MS = 30000;
const LISTING_TIMEOUT_MS = 15000;
const MAX_ATTEMPTS = 2;
const CHALLENGE_STEPS = 4;

interface ParsedHolidaysPayload {
  items: string[];
  fetchedAt: string;
  sourceUrl: string;
}

function normalizeHolidayText(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

function isAntiBotPageTitle(title: string): boolean {
  const normalized = title.toLowerCase();
  return (
    normalized.includes('проверка безопасности') ||
    normalized.includes('security check')
  );
}

async function extractHolidayItemsFromPage(): Promise<string[]> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'ru-RU',
      timezoneId: 'Europe/Moscow',
    });

    const page = await context.newPage();
    page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);

    await page.goto(HOLIDAYS_SOURCE_URL, { waitUntil: 'domcontentloaded' });

    for (let step = 0; step < CHALLENGE_STEPS; step += 1) {
      const hasListing = await page.locator('.listing_wr').count();
      if (hasListing > 0) {
        break;
      }

      const challengeTitle = isAntiBotPageTitle(await page.title());
      if (!challengeTitle) {
        await page.waitForTimeout(1000);
        continue;
      }

      await page
        .waitForFunction(
          () => {
            const tokenInput =
              document.querySelector<HTMLInputElement>('input[name="s"]');
            return Boolean(tokenInput?.value);
          },
          null,
          { timeout: 6000 },
        )
        .catch(() => undefined);

      const submitted = await page.evaluate(() => {
        const form =
          document.querySelector<HTMLFormElement>('form#ff') ??
          document.querySelector<HTMLFormElement>('form');
        if (!form) return false;
        form.submit();
        return true;
      });

      if (submitted) {
        await page.waitForLoadState('domcontentloaded', {
          timeout: NAVIGATION_TIMEOUT_MS,
        });
      } else {
        await page.waitForTimeout(1200);
        await page.reload({ waitUntil: 'domcontentloaded' });
      }
    }

    await page.waitForSelector('.listing_wr', { timeout: LISTING_TIMEOUT_MS });

    const itemPropTexts = await page.$$eval(
      '.listing_wr [itemprop="text"]',
      (nodes) =>
        nodes
          .filter((node) => !node.closest('.listing_next'))
          .map((node) => node.textContent ?? '')
          .map((text) => text.replace(/\s+/g, ' ').trim())
          .filter((text) => text.length > 0),
    );

    if (itemPropTexts.length > 0) {
      return [...new Set(itemPropTexts.map(normalizeHolidayText))];
    }

    const items = await page.$$eval('.listing_wr li', (nodes) =>
      nodes
        .filter((node) => !node.closest('.listing_next'))
        .map((node) => node.textContent ?? '')
        .map((text) => text.replace(/\s+/g, ' ').trim())
        .filter((text) => text.length > 0),
    );

    if (items.length > 0) {
      return [...new Set(items.map(normalizeHolidayText))];
    }

    {
      const links = await page.$$eval('.listing_wr a', (nodes) =>
        nodes
          .filter((node) => !node.closest('.listing_next'))
          .map((node) => node.textContent ?? '')
          .map((text) => text.replace(/\s+/g, ' ').trim())
          .filter((text) => text.length > 0),
      );
      return [...new Set(links.map(normalizeHolidayText))];
    }
  } finally {
    await browser.close();
  }
}

async function loadTodayHolidays(): Promise<ParsedHolidaysPayload> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const items = await extractHolidayItemsFromPage();
      if (items.length === 0) {
        throw new HttpError(
          502,
          'Не удалось извлечь список праздников из блока listing_wr',
        );
      }
      return {
        items,
        fetchedAt: new Date().toISOString(),
        sourceUrl: HOLIDAYS_SOURCE_URL,
      };
    } catch (error: unknown) {
      lastError = error;
    }
  }

  throw new HttpError(
    503,
    'Не удалось получить праздники через headless browser. Источник временно недоступен.',
    lastError instanceof Error ? { reason: lastError.message } : undefined,
  );
}

export async function listTodayHolidays(
  _req: Request,
  res: Response,
): Promise<void> {
  const payload = await loadTodayHolidays();
  res.json(payload);
}

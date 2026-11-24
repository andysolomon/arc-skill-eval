import type { Page } from '@playwright/test';
import { expect, goToSection, openApp, reloadApp, settle, test } from './fixtures/test';

const chapters = [
  { num: '01', label: 'Overview', title: 'What arc-skill-eval is for' },
  { num: '02', label: 'Anatomy of a skill', title: 'Anatomy of a skill' },
  { num: '03', label: 'Creating an eval', title: 'Creating an eval' },
  { num: '04', label: 'Writing assertions', title: 'Writing assertions' },
  { num: '05', label: 'The with / without signal', title: 'The with / without signal' },
  { num: '06', label: 'Anatomy of a run', title: 'Anatomy of a run' },
  { num: '07', label: 'The Pi runtime', title: 'The Pi runtime' },
] as const;

const chapterRail = (page: Page) => page.getByRole('complementary', { name: 'Learn chapters' });
const chapterButton = (page: Page, label: string) =>
  chapterRail(page).getByRole('button', { name: label });
const chapterTitle = (page: Page) =>
  page.getByTestId('learn-app').getByRole('heading', { level: 1 });

const expectChapter = async (page: Page, chapter: (typeof chapters)[number]) => {
  await expect(chapterButton(page, chapter.label)).toHaveAttribute('aria-current', 'page');
  await expect(chapterRail(page).locator('[aria-current="page"]')).toHaveCount(1);
  await expect(page.getByTestId('learn-app')).toContainText(`chapter ${chapter.num}`);
  await expect(chapterTitle(page)).toHaveText(chapter.title);
};

const openLearn = async (page: Page) => {
  await openApp(page);
  await goToSection(page, 'learn');
  await expect(page.getByTestId('learn-app')).toBeVisible();
};

test('opens on the overview chapter with all seven chapters listed', async ({ page }) => {
  await openLearn(page);

  await expect(chapterRail(page).getByRole('button')).toHaveText(
    chapters.map((chapter) => new RegExp(`${chapter.num}\\s*${escape(chapter.label)}`)),
  );
  await expectChapter(page, chapters[0]);
});

test('the chapter rail opens every chapter', async ({ page }) => {
  await openLearn(page);

  for (const chapter of chapters.slice(1)) {
    await chapterButton(page, chapter.label).click();
    await expectChapter(page, chapter);
  }

  await chapterButton(page, 'Overview').click();
  await expectChapter(page, chapters[0]);
});

test('overview deep-dive cards open their chapter by click and keyboard', async ({ page }) => {
  await openLearn(page);
  const learn = page.getByTestId('learn-app');

  const cards = learn.getByRole('button').filter({ hasText: '→' });
  await expect(cards).toHaveCount(chapters.length - 1);

  await cards.filter({ hasText: 'Writing assertions' }).click();
  await expectChapter(page, chapters[3]);

  await chapterButton(page, 'Overview').click();
  await cards.filter({ hasText: 'The Pi runtime' }).focus();
  await page.keyboard.press('Enter');
  await expectChapter(page, chapters[6]);

  await chapterButton(page, 'Overview').click();
  await cards.filter({ hasText: 'Anatomy of a run' }).focus();
  await page.keyboard.press(' ');
  await expectChapter(page, chapters[5]);
});

test('opening a chapter scrolls the reader back to the top', async ({ page }) => {
  await openLearn(page);
  const reader = page.locator('#learn-scroll');

  await reader.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  await expect.poll(() => reader.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  await chapterButton(page, 'Anatomy of a skill').click();
  await expectChapter(page, chapters[1]);
  await expect.poll(() => reader.evaluate((element) => element.scrollTop)).toBe(0);
});

test('the current chapter persists across reload', async ({ page }) => {
  await openLearn(page);
  await chapterButton(page, 'The with / without signal').click();
  await expectChapter(page, chapters[4]);

  await page.waitForTimeout(500);
  await reloadApp(page);
  await expectChapter(page, chapters[4]);
  await expect(page.getByTestId('section-nav-tab-learn')).toHaveAttribute('aria-current', 'page');
});

test('animated demos can be paused and resumed', async ({ page }) => {
  await openLearn(page);

  for (const label of ['Creating an eval', 'The Pi runtime']) {
    await chapterButton(page, label).click();
    const learn = page.getByTestId('learn-app');
    const pause = learn.getByText('⏸ pause').first();
    await expect(pause).toBeVisible();
    await expect(learn.getByText('↻ replay').first()).toBeVisible();

    await pause.click();
    await expect(learn.getByText('▶ play').first()).toBeVisible();
    await learn.getByText('▶ play').first().click();
    await expect(learn.getByText('⏸ pause').first()).toBeVisible();
    await learn.getByText('⏸ pause').first().click();
  }
});

test('number-key section hotkeys still work from Learn', async ({ page }) => {
  await openLearn(page);
  await chapterButton(page, 'Anatomy of a run').click();
  await expectChapter(page, chapters[5]);
  await page.waitForTimeout(500);

  await page.keyboard.press('4');
  await expect(page.getByTestId('review-empty-state')).toBeVisible();
  await settle(page);
  await page.keyboard.press('5');
  await expectChapter(page, chapters[5]);
});

function escape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

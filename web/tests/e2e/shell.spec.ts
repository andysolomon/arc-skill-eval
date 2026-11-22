import { expect, goToSection, openApp, reloadApp, settle, switchEnv, test } from './fixtures/test';

const sections = [
  { key: '1', name: 'run' },
  { key: '2', name: 'browse' },
  { key: '3', name: 'create' },
  { key: '4', name: 'review' },
  { key: '5', name: 'learn' },
] as const;

const documentTheme = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.dataset.theme);

test.describe('section navigation', () => {
  test('opens on run with exactly one active tab in the Sections nav', async ({ page }) => {
    await openApp(page);

    const nav = page.getByRole('navigation', { name: 'Sections' });
    await expect(nav.getByRole('button')).toHaveText(['run', 'browse', 'create', 'review', 'learn']);
    await expect(page.getByTestId('section-nav-tab-run')).toHaveAttribute('aria-current', 'page');
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(page.getByTestId('run-app')).toBeVisible();
  });

  test('number keys 1-5 jump to the matching section', async ({ page }) => {
    await openApp(page);

    for (const section of [...sections].reverse()) {
      await page.keyboard.press(section.key);
      await expect(page.getByTestId(`section-nav-tab-${section.name}`)).toHaveAttribute(
        'aria-current',
        'page',
      );
      await expect(page.getByTestId('status-bar')).toContainText(section.name);
      // In the React app, switching again before the previous choice has been
      // persisted makes the shell bounce between the two sections. Pause like a
      // human would so this spec pins the intended behavior, not that bug.
      await settle(page);
    }

    // Keys outside 1-5 do nothing.
    await page.keyboard.press('7');
    await page.keyboard.press('0');
    await expect(page.getByTestId('section-nav-tab-run')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('run-app')).toBeVisible();
  });

  test('number keys are ignored while typing in an input or textarea', async ({ page }) => {
    await openApp(page);

    // <input>: the Create wizard's skill name field.
    await goToSection(page, 'create');
    const skillName = page.getByRole('textbox', { name: 'skill name' });
    await skillName.fill('');
    await skillName.pressSequentially('skill-12345');
    await expect(skillName).toHaveValue('skill-12345');
    await expect(page.getByTestId('section-nav-tab-create')).toHaveAttribute('aria-current', 'page');

    // <textarea>: the Review import box.
    await goToSection(page, 'review');
    const paste = page.getByRole('textbox', { name: 'paste arc-skill-eval json' });
    await paste.pressSequentially('[1, 2, 5]');
    await expect(paste).toHaveValue('[1, 2, 5]');
    await expect(page.getByTestId('section-nav-tab-review')).toHaveAttribute('aria-current', 'page');

    // Once focus leaves the field, the hotkeys work again.
    await paste.blur();
    await page.keyboard.press('5');
    await expect(page.getByTestId('learn-app')).toBeVisible();
  });

  test('active section persists across reload', async ({ page }) => {
    await openApp(page);
    await goToSection(page, 'learn');
    await expect(page.getByTestId('learn-app')).toBeVisible();

    await reloadApp(page);
    await expect(page.getByTestId('section-nav-tab-learn')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('learn-app')).toBeVisible();
  });
});

test.describe('theme picker', () => {
  test('defaults to tokyonight and marks exactly one option checked', async ({ page }) => {
    await openApp(page);

    const picker = page.getByRole('radiogroup', { name: 'Theme' });
    await expect(picker.getByRole('radio')).toHaveText(['tn', 'gb', 'nord']);
    await expect.poll(() => documentTheme(page)).toBe('tokyonight');
    await expect(page.getByTestId('theme-option-tokyonight')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('theme-option-gruvbox')).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId('theme-option-nord')).toHaveAttribute('aria-checked', 'false');
  });

  test('chosen theme persists across reload', async ({ page }) => {
    await openApp(page);

    await page.getByTestId('theme-option-gruvbox').click();
    await expect.poll(() => documentTheme(page)).toBe('gruvbox');
    await expect(page.getByTestId('theme-option-gruvbox')).toHaveAttribute('aria-checked', 'true');

    await reloadApp(page);
    await expect.poll(() => documentTheme(page)).toBe('gruvbox');
    await expect(page.getByTestId('theme-option-gruvbox')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('theme-option-tokyonight')).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  test('a legacy localStorage theme is migrated on first load', async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('seeded')) {
        sessionStorage.setItem('seeded', '1');
        localStorage.setItem('arc-pi-theme', 'nord');
      }
    });
    await openApp(page);

    await expect.poll(() => documentTheme(page)).toBe('nord');
    await expect(page.getByTestId('theme-option-nord')).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('arc-pi-theme'))).toBeNull();

    // The migrated value is now the persisted preference.
    await reloadApp(page);
    await expect.poll(() => documentTheme(page)).toBe('nord');
  });
});

test.describe('environment toggle', () => {
  test('switches between hosted and localhost and persists', async ({ page }) => {
    await openApp(page);

    const envGroup = page.getByRole('radiogroup', { name: 'Environment' });
    await expect(envGroup.getByRole('radio')).toHaveText(['hosted', 'localhost']);
    await expect(page.getByTestId('env-option-hosted')).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.env)).toBe('hosted');
    await expect(page.getByTestId('workspace-chip')).toHaveCount(0);
    await expect(page.getByTestId('run-app')).toHaveAttribute('data-env', 'hosted');

    await switchEnv(page, 'localhost');
    await expect(page.getByTestId('workspace-chip')).toBeVisible();
    await expect(page.getByTestId('run-app')).toHaveAttribute('data-env', 'localhost');

    await reloadApp(page);
    await expect(page.getByTestId('env-option-localhost')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('workspace-chip')).toBeVisible();

    await switchEnv(page, 'hosted');
    await expect(page.getByTestId('workspace-chip')).toHaveCount(0);
  });

  test('workspace dropdown opens, explains offline daemon, and closes on Escape', async ({
    page,
  }) => {
    await openApp(page);
    await switchEnv(page, 'localhost');

    await page.getByTestId('workspace-chip').click();
    const dropdown = page.getByTestId('workspace-dropdown');
    await expect(dropdown).toBeVisible();
    await expect(dropdown).toContainText('Saved directories');
    await expect(dropdown).toContainText('daemon offline');
    await expect(
      dropdown.getByRole('textbox', { name: 'Enter a folder path or GitHub repository URL' }),
    ).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dropdown).toBeHidden();
  });
});

test.describe('status bar', () => {
  test('names the active section and shows section-specific hints', async ({ page }) => {
    await openApp(page);
    const statusBar = page.getByTestId('status-bar');

    const hints: Record<(typeof sections)[number]['name'], string[]> = {
      run: ['run', 'compare', 'nav'],
      browse: ['select', 'mode', 'raw'],
      create: ['case', 'toggle'],
      review: ['feedback', 'improve'],
      learn: ['sections', 'chapters'],
    };

    for (const section of sections) {
      await goToSection(page, section.name);
      for (const hint of hints[section.name]) {
        await expect(statusBar).toContainText(hint);
      }
    }

    await expect(statusBar).toContainText('anthropic/claude-opus-4-5');
    await expect(statusBar).toContainText('judge ministral-8b-latest');
    await expect(page.getByTestId('status-reset-hosted-data')).toHaveText('Reset hosted data');
  });

  test('dismissing the reset confirmation keeps state', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('theme-option-gruvbox').click();
    await goToSection(page, 'learn');

    let confirmMessage = '';
    page.once('dialog', (dialog) => {
      confirmMessage = dialog.message();
      void dialog.dismiss();
    });
    await page.getByTestId('status-reset-hosted-data').click();

    await expect.poll(() => confirmMessage).toBe('Reset hosted data?');
    await expect(page.getByTestId('learn-app')).toBeVisible();
    await expect.poll(() => documentTheme(page)).toBe('gruvbox');
  });

  test('confirming reset clears persisted section, theme and env', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('theme-option-nord').click();
    await switchEnv(page, 'localhost');
    await goToSection(page, 'review');

    page.on('dialog', (dialog) => void dialog.accept());
    await Promise.all([
      page.waitForEvent('load'),
      page.getByTestId('status-reset-hosted-data').click(),
    ]);

    await expect(page.getByTestId('section-nav-tab-run')).toHaveAttribute('aria-current', 'page');
    await expect.poll(() => documentTheme(page)).toBe('tokyonight');
    await expect(page.getByTestId('env-option-hosted')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('workspace-chip')).toHaveCount(0);
  });
});

test('install chip copies the install command', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openApp(page);

  const chip = page.getByTestId('install-command-chip');
  await expect(chip).toContainText('npm i -g arc-skill-eval');
  await expect(chip).not.toContainText('copied');

  await chip.click();
  await expect(chip).toContainText('copied');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(
    'npm i -g arc-skill-eval',
  );

  // The confirmation resets itself.
  await expect(chip).not.toContainText('copied', { timeout: 5000 });
});

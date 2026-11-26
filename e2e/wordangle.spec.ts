import { expect, test } from '@playwright/test';

// Keep API mocks in control of requests after a reload
test.use({ serviceWorkers: 'block' });

test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => route.abort());
  await page.route('**/api/wordangle/today?*', (route) => route.fulfill({
    json: { word: 'banana', number: 42 },
  }));
  await page.route('**/api/wordangle/lists/*.txt', (route) => {
    const file = new URL(route.request().url()).pathname.split('/').pop();
    const words = file === 'allowed-3.txt' ? 'box' : file === 'allowed-4.txt' ? 'bank' : 'banana';
    return route.fulfill({ body: `${words}\n` });
  });
  await page.addInitScript(() => {
    localStorage.setItem('wordangle-help-seen', '1');
    Object.defineProperty(navigator.clipboard, 'writeText', {
      value: (text: string) => { window.sessionStorage.setItem('shared-result', text); },
    });
  });
  await page.goto('/wordangle');
});

test('reverse mode aligns rows, scores suffixes, and stays locked with the daily game', async ({ page }) => {
  const board = page.locator('[data-wordangle="board"]');
  const toggle = page.getByRole('switch', { name: 'Reverse Mode' });
  const one = board.locator('.tr-row').first();
  const six = board.locator('.tr-row').last();
  const edges = () => Promise.all([one.boundingBox(), six.boundingBox()]);
  await expect(six).toBeVisible();
  await expect(toggle).toBeEnabled();
  await expect(toggle).not.toBeChecked();
  await expect.poll(async () => {
    const [a, b] = await edges();
    return Math.abs(a!.x - b!.x);
  }).toBeLessThan(1);

  await page.getByText('Reverse Mode', { exact: true }).click();
  await expect(toggle).toBeChecked();
  await expect.poll(async () => {
    const [a, b] = await edges();
    return Math.abs(a!.x + a!.width - b!.x - b!.width);
  }).toBeLessThan(1);

  await board.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toBeEnabled();
  await page.keyboard.type('a');
  await page.keyboard.press('Enter');
  await expect(one.locator('.tr-tile')).toHaveClass(/\bexact\b/);
  await expect(toggle).toBeDisabled();

  await page.getByRole('button', { name: 'Random', exact: true }).click();
  await expect(toggle).toBeEnabled();
  await expect(toggle).toBeChecked();
  await page.getByText('Reverse Mode', { exact: true }).click();
  await page.getByRole('button', { name: 'Daily #42' }).click();
  await expect(toggle).toBeChecked();
  await expect(toggle).toBeDisabled();
  await expect(one.locator('.tr-tile')).toHaveClass(/\bexact\b/);

  await six.click();
  await page.keyboard.type('banana');
  await page.keyboard.press('Enter');
  const result = page.getByRole('dialog');
  await expect(result.getByText('Wordangle #42 · Reverse')).toBeVisible();
  await result.getByRole('button', { name: 'Share result' }).click();
  expect(await page.evaluate(() => sessionStorage.getItem('shared-result'))).toContain('Wordangle #42 · Reverse');
});

test('reverse mode remembers the preference between games but resets on reload', async ({ page }) => {
  const toggle = page.getByRole('switch', { name: 'Reverse Mode' });
  await expect(toggle).toBeEnabled();
  await page.getByText('Reverse Mode', { exact: true }).click();
  await page.getByRole('button', { name: 'Random', exact: true }).click();
  await expect(toggle).toBeChecked();
  await page.getByRole('button', { name: 'New word', exact: true }).click();
  await expect(toggle).toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem('wordangle-reverse-mode'))).toBeNull();
  await page.reload();
  await expect(toggle).toBeEnabled();
  await expect(toggle).not.toBeChecked();
  await page.getByRole('button', { name: 'Random', exact: true }).click();
  await expect(toggle).not.toBeChecked();
  await page.reload();
  await expect(toggle).toBeEnabled();
  await expect(toggle).not.toBeChecked();
});

for (const reload of [false, true]) {
  test(`reverse mode resets the next puzzle day ${reload ? 'after reload' : 'on a new game'}`, async ({ page }) => {
    const toggle = page.getByRole('switch', { name: 'Reverse Mode' });
    await page.clock.install({ time: new Date('2026-06-01T16:00:00Z') });
    await page.reload();
    await expect(toggle).toBeEnabled();
    await page.getByText('Reverse Mode', { exact: true }).click();
    await page.getByRole('button', { name: 'Random', exact: true }).click();
    await expect(toggle).toBeChecked();
    await page.clock.setSystemTime(new Date('2026-06-02T16:00:00Z'));
    if (reload) await page.reload();
    else await page.getByRole('button', { name: 'New word', exact: true }).click();
    await expect(toggle).toBeEnabled();
    await expect(toggle).not.toBeChecked();
  });
}

test('high contrast recolors played guesses and shares, and remembers the setting', async ({ page }) => {
  const board = page.getByLabel('Guess board');
  const keyboard = page.getByLabel('On-screen keyboard');
  const settings = page.getByRole('main').getByRole('button', { name: 'Settings', exact: true });
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  const toggle = dialog.getByRole('switch', { name: 'High Contrast Mode' });
  const close = dialog.getByRole('button', { name: 'Close', exact: true });

  await expect(board.locator('.tr-row')).toHaveCount(6);
  await page.keyboard.press('a');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.type('box');
  await page.keyboard.press('Enter');
  await expect(board.locator('.tr-tile.exact')).toHaveCSS('background-color', 'rgb(83, 141, 78)');

  await settings.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).not.toBeChecked();
  await dialog.getByText('High Contrast Mode', { exact: true }).click();
  await expect(toggle).toBeChecked();
  await close.click();
  for (const [area, prefix] of [[board, 'tile'], [keyboard, 'key']] as const) {
    await expect(area.locator(`.tr-${prefix}.exact`)).toHaveCSS('background-color', 'rgb(245, 121, 58)');
    await expect(area.locator(`.tr-${prefix}.present`)).toHaveCSS('background-color', 'rgb(133, 192, 249)');
    await expect(area.locator(`.tr-${prefix}.absent`).first()).toHaveCSS('background-color', 'rgb(120, 124, 126)');
  }

  await expect(settings).toBeFocused();
  await page.keyboard.type('bank');
  await page.keyboard.press('Enter');
  await expect(board.getByRole('button', { name: '4-letter row, submitted' })).toBeVisible();
  const arrow = board.locator('.tr-tile.exact .tr-arrow.right').first();
  await expect(arrow).toHaveCSS('fill', 'rgb(133, 192, 249)');
  await expect(arrow).toHaveCSS('stroke', 'none');

  await page.getByRole('button', { name: 'How to play' }).click();
  await expect(page.locator('.tr-swatch.present')).toHaveCSS('background-color', 'rgb(133, 192, 249)');
  await expect(page.locator('.tr-swatch.exact .tr-arrow.right')).toHaveCSS('fill', 'rgb(133, 192, 249)');
  await page.keyboard.press('Escape');
  await board.locator('.tr-row').nth(5).click();
  await page.keyboard.type('banana');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Share result' }).click();
  expect(await page.evaluate(() => sessionStorage.getItem('shared-result'))).toContain('🟦\n🟧⬜⬜');

  await page.reload();
  await settings.click();
  await expect(toggle).toBeChecked();
  await dialog.getByText('High Contrast Mode', { exact: true }).click();
  await close.click();
  await page.reload();
  await settings.click();
  await expect(toggle).not.toBeChecked();
});

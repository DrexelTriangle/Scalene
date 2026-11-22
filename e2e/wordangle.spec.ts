import { expect, test } from '@playwright/test';

test('high contrast recolors played guesses and shares, and remembers the setting', async ({ page }) => {
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

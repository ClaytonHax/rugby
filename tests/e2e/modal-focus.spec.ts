import { expect, test } from '@playwright/test';
import { createAuthUser, resetEmulators, seedDoc } from './emulator';
import { login, newSession, PASSWORD } from './helpers';

// Regression: typing in a modal field used to lose focus after every key, because the modal's effect re-ran
// whenever the parent re-rendered with a fresh onClose callback.
const UNION = 'focus.admin@tryline.test';

test('typing in a modal input keeps focus for every key', async ({ browser }) => {
  await resetEmulators();
  const uid = await createAuthUser(UNION, PASSWORD, false);
  await seedDoc(`users/${uid}`, {
    uid, email: UNION, displayName: 'Focus Admin', role: 'union_admin', schoolId: null, active: true, createdAt: new Date(),
  });

  const s = await newSession(browser);
  const { page } = s;
  await login(s, UNION);
  await page.goto('/app/users');
  const opener = page.getByRole('button', { name: 'Invite user' });
  await opener.click();

  const dialog = page.getByRole('dialog', { name: 'Invite a user' });
  await expect(dialog).toBeVisible();
  const email = dialog.getByLabel('Email');
  // The first field is focused when the dialog opens.
  await expect(email).toBeFocused();

  const typed = 'a.long.address.for.focus.check@schoola.test';
  await email.pressSequentially(typed, { delay: 30 });
  await expect(email).toHaveValue(typed);
  await expect(email).toBeFocused();

  // Tab stays inside the dialog, and closing hands focus back to the button that opened it.
  for (let i = 0; i < 8; i++) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await s.ctx.close();
});

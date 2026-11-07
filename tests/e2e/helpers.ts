import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

export const SHOTS = join(process.cwd(), 'tests/e2e/screenshots');
mkdirSync(SHOTS, { recursive: true });

export const PASSWORD = 'Passw0rd-test1';

export interface Session { ctx: BrowserContext; page: Page; errors: string[] }

/** Opens a phone-sized browser context and records every console error and uncaught exception. */
export async function newSession(browser: Browser): Promise<Session> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${page.url()} :: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${page.url()} :: ${e.message}`));
  return { ctx, page, errors };
}

/** Fails if the page has logged console errors; prints and clears them. */
export function expectNoConsoleErrors(s: Session, where: string): void {
  const errs = s.errors.splice(0);
  expect(errs, `console errors on ${where}`).toEqual([]);
}

export async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
}

/** No horizontal page scroll at 360px wide. */
export async function expectNoHScroll(page: Page, where: string): Promise<void> {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.waitForTimeout(150);
  const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  await page.setViewportSize({ width: 390, height: 844 });
  expect(w.sw, `horizontal scroll on ${where} (scrollWidth ${w.sw} > ${w.cw})`).toBeLessThanOrEqual(w.cw);
}

/** Console + overflow check, plus a screenshot. */
export async function audit(s: Session, name: string, opts: { shot?: boolean } = {}): Promise<void> {
  await s.page.waitForTimeout(300);
  await expectNoHScroll(s.page, name);
  if (opts.shot !== false) await shot(s.page, name);
  expectNoConsoleErrors(s, name);
}

export async function login(s: Session, email: string, password = PASSWORD): Promise<void> {
  await s.page.goto('/login');
  await s.page.getByLabel('Email').fill(email);
  await s.page.getByLabel(/^Password/).fill(password);
  await s.page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(s.page).toHaveURL(/\/app/);
}

export async function signOut(s: Session): Promise<void> {
  await s.page.goto('/app/account');
  await s.page.getByRole('button', { name: 'More' }).click();
  await s.page.getByRole('button', { name: 'Sign out' }).click();
  await expect(s.page).toHaveURL(/localhost:\d+\/(login)?$/);
}

/** Sign up through the UI. No email verification step exists: an invited address lands in /app, others in /no-access. Returns the final path. */
export async function signUp(s: Session, email: string, name: string): Promise<string> {
  const { page } = s;
  await page.goto('/signup');
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: /^Welcome,|^No access yet/ })).toBeVisible();
  expect(page.url()).not.toContain('verify-email');
  return new URL(page.url()).pathname;
}

export async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.getByText(text).first()).toBeVisible();
}

// ---- generated test files (no real people, no real documents) -----------------------------

export async function makeJpeg(page: Page, w: number, h: number, hue: number, label: string): Promise<Buffer> {
  const b64 = await page.evaluate(({ w, h, hue, label }) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, `hsl(${hue},70%,45%)`); grad.addColorStop(1, `hsl(${(hue + 80) % 360},60%,75%)`);
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(w / 2, h / 3, Math.min(w, h) / 6, 0, Math.PI * 2); g.fill();
    g.fillRect(w / 4, h / 2, w / 2, h / 3);
    g.fillStyle = '#10201B'; g.font = `${Math.round(h / 12)}px sans-serif`; g.fillText(label, 12, h - 16);
    return c.toDataURL('image/jpeg', 0.9).split(',')[1];
  }, { w, h, hue, label });
  return Buffer.from(b64, 'base64');
}

/** A structurally plausible PDF whose body is deterministic pseudo-random bytes, > 1 MB so it needs two chunks. */
export function makePdf(bytes = 1_300_000): Buffer {
  const body = Buffer.alloc(bytes);
  let x = 123456789;
  for (let i = 0; i < bytes; i++) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; body[i] = x >>> 24; }
  return Buffer.concat([
    Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Length ${bytes} >>\nstream\n`),
    body,
    Buffer.from('\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n'),
  ]);
}

export const sha256 = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

export const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Date of birth that makes someone exactly `years` old today, minus `daysAgo` days of extra age. */
export function dobYearsAgo(years: number, extraDays = 0): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() - extraDays);
  return iso(d);
}

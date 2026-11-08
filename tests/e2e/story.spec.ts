import { expect, test, type Page } from '@playwright/test';
import { createAuthUser, listDocs, readDoc, resetEmulators, seedDoc } from './emulator';
import {
  audit, dobYearsAgo, expectNoConsoleErrors, expectNoHScroll, iso, login, makeJpeg, makePdf, newSession, PASSWORD, sha256,
  shot, signOut, signUp, type Session,
} from './helpers';

// All people, schools and documents below are fictional or generated.
const UNION = 'union.admin@tryline.test';
const SCHOOL_ADMIN = 'head.a@schoola.test';
const REGISTRAR = 'registrar@tryline.test';
const STRANGER = 'nobody@elsewhere.test';
const COACH = 'coach@schoola.test';
const SCORER = 'scorer@schoola.test';

const today = new Date();
const matchDay = new Date(today.getTime() + 30 * 86400_000);
const MATCH_DATE = iso(matchDay);
const MATCH_YEAR = String(matchDay.getFullYear());
// Exactly 19 on the match day, so 18 today: over-age only on the date of the match.
const TURNER_DOB = (() => { const d = new Date(matchDay); d.setFullYear(d.getFullYear() - 19); return iso(d); })();

interface PlayerRow { id: string; firstName: string; lastName: string; status: string; registrationNo?: string; docTypes: string[]; schoolId: string }

async function fillRegistrationDetails(page: Page, p: { first: string; last: string; dob: string; idNumber: string; position: string }) {
  await page.getByLabel(/^First name/).fill(p.first);
  await page.getByLabel(/^Last name/).fill(p.last);
  await page.getByLabel(/^Date of birth/).fill(p.dob);
  await page.getByLabel(/^ID number/).fill(p.idNumber);
  await page.getByLabel(/^Usual position/).selectOption({ label: p.position });
}
async function fillGuardian(page: Page, name: string, phone: string) {
  await page.getByLabel(/^Parent or guardian name/).fill(name);
  await page.getByLabel(/^Guardian phone/).fill(phone);
  await page.getByRole('checkbox').check();
}
async function upload(page: Page, label: string, file: { name: string; mimeType: string; buffer: Buffer }) {
  await page.getByLabel(`Choose file for ${label}`).setInputFiles(file);
  await expect(page.getByText(`Uploaded`).first()).toBeVisible({ timeout: 30_000 });
}

test('Tryline end-to-end story', async ({ browser }) => {
  await resetEmulators();
  const sessions: Session[] = [];
  const open = async () => { const s = await newSession(browser); sessions.push(s); return s; };

  // ---- Bootstrap: first union_admin (rules disabled through Admin REST) ----
  const unionUid = await createAuthUser(UNION, PASSWORD, false);
  await seedDoc(`users/${unionUid}`, {
    uid: unionUid, email: UNION, displayName: 'Chipo Admin', role: 'union_admin', schoolId: null, active: true, createdAt: new Date(),
  });

  const union = await open();
  let schoolAId = '';
  let schoolBId = '';

  // ======================================================================================
  await test.step('1. Union admin signs in, adds School A and B, invites school admin and registrar', async () => {
    await login(union, UNION);
    await expect(union.page.locator('main').getByText('Union administrator', { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await audit(union, '01-union-dashboard');

    await union.page.goto('/app/schools');
    for (const [name, town, province] of [['School A', 'Harare', 'Harare'], ['School B', 'Bulawayo', 'Bulawayo']]) {
      await union.page.getByRole('button', { name: 'Add school' }).first().click();
      await union.page.getByLabel(/^School name/).fill(name);
      await union.page.getByLabel(/^Town/).fill(town);
      await union.page.getByLabel(/^Province/).selectOption({ label: province });
      await union.page.getByRole('button', { name: 'Save school' }).click();
      await expect(union.page.getByText('School saved.')).toBeVisible();
      await expect(union.page.getByRole('dialog')).toHaveCount(0);
    }
    await expect(union.page.getByText('School A').filter({ visible: true }).first()).toBeVisible();
    await expect(union.page.getByText('School B').filter({ visible: true }).first()).toBeVisible();
    await audit(union, '02-schools-admin');
    const schools = await listDocs<{ name: string }>('schools');
    schoolAId = schools.find((s) => s.name === 'School A')!.id;
    schoolBId = schools.find((s) => s.name === 'School B')!.id;

    await union.page.goto('/app/users');
    const invite = async (email: string, role: string, school?: string) => {
      await union.page.getByRole('button', { name: 'Invite user' }).click();
      await union.page.getByLabel('Email').fill(email);
      await union.page.getByLabel('Role').selectOption({ label: role });
      if (school) await union.page.getByLabel(/^School/).selectOption({ label: school });
      await union.page.getByRole('button', { name: 'Save invitation' }).click();
      await expect(union.page.getByText(/Invitation saved/)).toBeVisible();
      await expect(union.page.getByRole('dialog')).toHaveCount(0);
    };
    await invite(SCHOOL_ADMIN, 'School administrator', 'School A');
    await invite(REGISTRAR, 'Registrar');
    await expect(union.page.getByText(SCHOOL_ADMIN).filter({ visible: true }).first()).toBeVisible();
    await expect(union.page.getByText(REGISTRAR).filter({ visible: true }).first()).toBeVisible();
    await audit(union, '03-users-invites');
  });

  // ======================================================================================
  const sa = await open();
  const registrar = await open();
  const coach = await open();
  const scorer = await open();
  await test.step('2. Invitees sign up (no verification step), get the right role; uninvited sees no-access; school admin invites coach', async () => {
    expect(await signUp(sa, SCHOOL_ADMIN, 'Rumbi Head')).toBe('/app');
    await expect(sa.page.locator('main').getByText('School administrator', { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await audit(sa, '04-school-admin-dashboard');

    expect(await signUp(registrar, REGISTRAR, 'Farai Registrar')).toBe('/app');
    await expect(registrar.page.locator('main').getByText('Registrar', { exact: true }).filter({ visible: true }).first()).toBeVisible();

    const stranger = await open();
    expect(await signUp(stranger, STRANGER, 'Nobody Special')).toBe('/no-access');
    await expect(stranger.page.getByRole('heading', { name: 'No access yet' })).toBeVisible();
    await audit(stranger, '05-no-access');
    await stranger.page.goto('/app/players');
    await expect(stranger.page).toHaveURL(/no-access/);
    await stranger.ctx.close();

    await sa.page.goto('/app/users');
    for (const [email, role] of [[COACH, 'Coach'], [SCORER, 'Match scorer']]) {
      await sa.page.getByRole('button', { name: 'Invite user' }).click();
      await sa.page.getByLabel('Email').fill(email);
      await sa.page.getByLabel('Role').selectOption({ label: role });
      await sa.page.getByRole('button', { name: 'Save invitation' }).click();
      await expect(sa.page.getByText(/Invitation saved/)).toBeVisible();
      await expect(sa.page.getByRole('dialog')).toHaveCount(0);
    }
    expect(await signUp(coach, COACH, 'Tafara Coach')).toBe('/app');
    await expect(coach.page.locator('main').getByText('Coach', { exact: true }).filter({ visible: true }).first()).toBeVisible();
    expect(await signUp(scorer, SCORER, 'Nyasha Scorer')).toBe('/app');
    await expect(scorer.page.locator('main').getByText('Match scorer', { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await audit(coach, '06-coach-dashboard');
    // The invites were consumed.
    expect((await listDocs('invites')).length).toBe(0);
    const users = await listDocs<{ email: string; role: string; schoolId: string | null }>('users');
    expect(users.find((u) => u.email === COACH)).toMatchObject({ role: 'coach', schoolId: schoolAId });
    expect(users.find((u) => u.email === SCHOOL_ADMIN)).toMatchObject({ role: 'school_admin', schoolId: schoolAId });
    expect(users.find((u) => u.email === REGISTRAR)).toMatchObject({ role: 'registrar', schoolId: null });
  });

  // ======================================================================================
  const png = await makeJpeg(coach.page, 400, 500, 200, 'GENERATED PHOTO');
  const cert = await makeJpeg(coach.page, 1400, 1000, 30, 'GENERATED CERTIFICATE');
  const pdf = makePdf();
  const file = (name: string, mimeType: string, buffer: Buffer) => ({ name, mimeType, buffer });

  await test.step('3. Coach registers players (stepper, uploads, chunked PDF), blocks, duplicates, staff', async () => {
    const page = coach.page;
    await page.goto('/app/players');
    await audit(coach, '07-players-empty');

    // --- Kuda Dube: photo + certificate image
    await page.goto('/app/players/new');
    await audit(coach, '08-register-step1');
    await fillRegistrationDetails(page, { first: 'Kuda', last: 'Dube', dob: dobYearsAgo(17, 40), idNumber: '63-123456 A 12', position: 'Hooker' });
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByLabel(/^Parent or guardian name/)).toBeVisible();
    // consent is required before leaving the guardian step
    await page.getByLabel(/^Parent or guardian name/).fill('Mai Dube');
    await page.getByLabel(/^Guardian phone/).fill('0771000001');
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText(/Consent from the parent or guardian is required/)).toBeVisible();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText('Passport-style photo').or(page.getByText('Photo', { exact: true })).first()).toBeVisible();
    await audit(coach, '09-register-documents');
    await upload(page, 'Photo', file('photo.png', 'image/jpeg', png));
    // Missing document: reach the submit step and confirm submit is blocked
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText('Still needed:')).toBeVisible();
    await expect(page.getByText(/Birth certificate document/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit for verification' })).toBeDisabled();
    await audit(coach, '10-register-submit-blocked');
    await page.getByRole('button', { name: 'Back' }).click();
    await upload(page, 'Birth certificate', file('cert.jpg', 'image/jpeg', cert));
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText(/Everything required is in place/)).toBeVisible();
    await page.getByRole('button', { name: 'Submit for verification' }).click();
    await expect(page).toHaveURL(/\/app\/players\/\w+$/);
    await expect(page.getByText('Pending').filter({ visible: true }).first()).toBeVisible();

    // --- Tendai Moyo: PDF over 1 MB as the birth certificate
    await page.goto('/app/players/new');
    await fillRegistrationDetails(page, { first: 'Tendai', last: 'Moyo', dob: dobYearsAgo(16, 100), idNumber: 'BC-778899', position: 'Fly-half' });
    await page.getByRole('button', { name: 'Next' }).click();
    await fillGuardian(page, 'Mai Moyo', '0771000002');
    await page.getByLabel(/^Guardian email/).fill('mai.moyo@example.test');
    await page.getByRole('button', { name: 'Next' }).click();
    await upload(page, 'Photo', file('photo.jpg', 'image/jpeg', png));
    await page.getByLabel('Choose file for Birth certificate').setInputFiles(file('scan.pdf', 'application/pdf', pdf));
    await expect(page.getByText(/scan\.pdf/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Submit for verification' }).click();
    await expect(page).toHaveURL(/\/app\/players\/\w+$/);

    // --- Duplicate ID number (same number, different formatting) is blocked
    await page.goto('/app/players/new');
    await fillRegistrationDetails(page, { first: 'Someone', last: 'Else', dob: dobYearsAgo(15, 10), idNumber: 'bc 778-899', position: 'Lock' });
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText(/already registered/)).toBeVisible();
    await expect(page.getByLabel(/^Parent or guardian name/)).toHaveCount(0);
    await audit(coach, '11-duplicate-blocked');
    expect((await listDocs<PlayerRow>('players')).filter((p) => p.lastName === 'Else')).toHaveLength(0);

    // --- Rudo Sibanda: left as a draft with only a photo
    await page.goto('/app/players/new');
    await fillRegistrationDetails(page, { first: 'Rudo', last: 'Sibanda', dob: dobYearsAgo(16, 200), idNumber: 'BC-445566', position: 'Left Wing' });
    await page.getByRole('button', { name: 'Next' }).click();
    await fillGuardian(page, 'Mai Sibanda', '0771000003');
    await page.getByRole('button', { name: 'Next' }).click();
    await upload(page, 'Photo', file('photo.jpg', 'image/jpeg', png));
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('button', { name: 'Submit for verification' })).toBeDisabled();

    // --- Staff: head coach
    await page.goto('/app/staff/new');
    await page.getByLabel(/^First name/).fill('Simba');
    await page.getByLabel(/^Last name/).fill('Chuma');
    await page.getByLabel(/^Date of birth/).fill('1985-06-02');
    await page.getByLabel(/^ID document type/).selectOption({ label: 'National ID' });
    await page.getByLabel(/^ID number/).fill('85-445566 Z 85');
    await page.getByLabel(/^Role/).selectOption({ label: 'Head coach' });
    await page.getByLabel(/^Phone/).fill('0771000009');
    await page.getByRole('button', { name: 'Next' }).click();
    await upload(page, 'Photo', file('photo.jpg', 'image/jpeg', png));
    await page.getByLabel('Choose file for National ID').setInputFiles(file('id.jpg', 'image/jpeg', cert));
    await expect(page.getByText(/id\.jpg/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Submit for verification' }).click();
    await expect(page).toHaveURL(/\/app\/staff\/\w+$/);

    await page.goto('/app/players');
    await expect(page.getByText('Kuda Dube').filter({ visible: true }).first()).toBeVisible();
    await audit(coach, '12-players-list');
    const rows = await listDocs<PlayerRow>('players');
    expect(rows.find((p) => p.lastName === 'Moyo')!.docTypes.sort()).toEqual(['birth_certificate', 'photo']);
    // the 1.3 MB PDF really is stored as two chunks
    const pdfDocs = await listDocs<{ chunkCount: number; size: number; type: string }>('documents');
    expect(pdfDocs.find((d) => d.size > 1_000_000)).toMatchObject({ chunkCount: 2, type: 'birth_certificate' });
  });

  // ======================================================================================
  let moyoRegNo = '';
  await test.step('4. Registrar queue, documents, reject with reason, verify, coach document access', async () => {
    const page = registrar.page;
    await page.goto('/app/verification');
    await expect(page.getByText('3 waiting')).toBeVisible();
    await audit(registrar, '13-verification-queue');

    // Tendai Moyo: PDF round trip
    await page.getByRole('button', { name: /Tendai Moyo/ }).click();
    const pdfLink = page.getByRole('link', { name: /Open PDF in a new tab/ });
    await expect(pdfLink).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('iframe[src^="blob:"]')).toBeVisible();
    const digest = await pdfLink.evaluate(async (a) => {
      const buf = await (await fetch((a as HTMLAnchorElement).href)).arrayBuffer();
      const h = await crypto.subtle.digest('SHA-256', buf);
      return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('');
    });
    expect(digest).toBe(sha256(pdf));
    const img = page.locator('img[alt="Photo"]');
    await expect(img).toBeVisible({ timeout: 30_000 });
    expect(await img.evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await audit(registrar, '14-verification-detail');
    await page.getByRole('button', { name: 'Verify', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Verify' }).click();
    const toast = page.getByText(/Registration number TL-\d{4}-[A-Z0-9]{6}/);
    await expect(toast).toBeVisible();
    moyoRegNo = ((await toast.first().textContent()) ?? '').match(/TL-\d{4}-[A-Z0-9]{6}/)![0];

    // Kuda Dube: reject with a reason (a reason is mandatory)
    await page.goto('/app/verification');
    await page.getByRole('button', { name: /Kuda Dube/ }).click();
    await expect(page.locator('img[alt="Birth certificate"]')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Reject', exact: true }).click();
    // A reason is required: submitting without one explains why and keeps the dialog open.
    await page.getByRole('dialog').getByRole('button', { name: 'Reject' }).click();
    await expect(page.getByRole('dialog').getByText(/Give a reason/)).toBeVisible();
    await expect(page.getByLabel(/^Reason/)).toBeFocused();
    await page.getByLabel(/^Reason/).fill('Photo is too blurred to identify the player');
    await page.getByRole('dialog').getByRole('button', { name: 'Reject' }).click();
    await expect(page.getByText('Rejected.')).toBeVisible();

    // Staff member
    await page.goto('/app/verification');
    await page.getByRole('button', { name: /Simba Chuma/ }).click();
    await expect(page.locator('img[alt="National ID"]')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Verify', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Verify' }).click();
    await expect(page.getByText(/Registration number TL-/)).toBeVisible();

    // Coach sees the rejection, fixes and resubmits; registrar then verifies
    const cp = coach.page;
    const kuda = (await listDocs<PlayerRow>('players')).find((p) => p.lastName === 'Dube')!;
    expect(kuda.status).toBe('rejected');
    await cp.goto(`/app/players/${kuda.id}`);
    await expect(cp.getByText('Photo is too blurred to identify the player')).toBeVisible();
    await cp.getByRole('link', { name: 'Continue registration' }).click();
    await cp.getByRole('button', { name: /^4 Submit/ }).click();
    await expect(cp.getByRole('button', { name: 'Submit for verification' })).toBeEnabled();
    await cp.getByRole('button', { name: 'Submit for verification' }).click();
    await expect(cp).toHaveURL(/\/app\/players\/\w+$/);
    await expect(cp.getByText('Pending').filter({ visible: true }).first()).toBeVisible();
    await page.goto('/app/verification');
    await page.getByRole('button', { name: /Kuda Dube/ }).click();
    await expect(page.locator('img[alt="Birth certificate"]')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Verify', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Verify' }).click();
    await expect(page.getByText(/Registration number TL-/)).toBeVisible();

    const after = await listDocs<PlayerRow>('players');
    expect(after.find((p) => p.lastName === 'Moyo')).toMatchObject({ status: 'verified', registrationNo: moyoRegNo });
    expect(after.find((p) => p.lastName === 'Dube')!.registrationNo).toMatch(/^TL-\d{4}-[A-Z0-9]{6}$/);

    // Coach: cannot open the ID document, can see the photo
    const moyo = after.find((p) => p.lastName === 'Moyo')!;
    await cp.goto(`/app/players/${moyo.id}`);
    await expect(cp.getByText(moyoRegNo).filter({ visible: true }).first()).toBeVisible();
    await expect(cp.getByText(/Only your school administrator and the registrar can open this file/)).toBeVisible();
    await expect(cp.getByRole('button', { name: 'View' })).toHaveCount(1); // photo only
    await cp.getByRole('button', { name: 'View' }).click();
    const cimg = cp.locator('img[alt="Photo"]');
    await expect(cimg).toBeVisible({ timeout: 30_000 });
    expect(await cimg.evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(cp.locator('iframe, img[alt="Birth certificate"]')).toHaveCount(0);
    await audit(coach, '15-coach-player-detail');
  });


  // ======================================================================================
  // Seed (rules disabled): verified School A players, to keep the story short.
  const seedPlayer = async (key: string, first: string, last: string, dob: string, position: string) => {
    await seedDoc(`players/seed_${key}`, {
      schoolId: schoolAId, schoolName: 'School A', firstName: first, lastName: last, dob, idType: 'birth_certificate',
      idNumber: `SEED-${key}`, status: 'verified', registrationNo: `TL-${today.getFullYear()}-SEED${key.toUpperCase().slice(0, 2)}`.slice(0, 14),
      teamIds: [], docTypes: [], position, guardianName: 'Seed Guardian', guardianPhone: '0770000000', consentGiven: true,
      createdBy: unionUid, createdAt: new Date(), updatedAt: new Date(), verifiedBy: unionUid,
    });
  };
  const OVER = [['Blessing', 'Mutasa'], ['Courage', 'Ndlovu'], ['Prosper', 'Zhou'], ['Wisdom', 'Hove']];
  const NORMAL = ['Anesu Banda', 'Chiedza Mhlanga', 'Tinashe Gumbo', 'Ruvimbo Sithole', 'Munashe Dlamini', 'Takudzwa Phiri',
    'Ngoni Mpofu', 'Panashe Zulu', 'Tawanda Nkomo', 'Simbarashe Tembo'];
  for (const [i, [f, l]] of OVER.entries()) await seedPlayer(`over${i}`, f, l, dobYearsAgo(20, 20 * i), 'Lock');
  await seedPlayer('exact18', 'Elvis', 'Chigumba', dobYearsAgo(18, 0), 'Number 8');
  await seedPlayer('turner', 'Gift', 'Marufu', TURNER_DOB, 'Fullback');
  for (const [i, n] of NORMAL.entries()) { const [f, l] = n.split(' '); await seedPlayer(`n${i}`, f, l, dobYearsAgo(16, 30 + i * 11), 'Scrum-half'); }

  let teamAId = '';
  let teamBId = '';
  let matchId = '';
  await test.step('5. Teams, roster, over-age cap (x/3), exactly-18 not over-age, unverified blocked', async () => {
    const page = sa.page;
    await page.goto('/app/teams');
    await audit(sa, '16-teams-empty');
    await page.getByRole('button', { name: 'New team' }).first().click();
    await expect(page.getByText(/Team name: School A U16A/)).toBeVisible();
    await page.getByRole('button', { name: 'Create team' }).click();
    await expect(page.getByText('Created School A U16A')).toBeVisible();

    const up = union.page;
    await up.goto('/app/teams');
    await up.getByRole('button', { name: 'New team' }).first().click();
    await up.getByLabel('School').selectOption({ label: 'School B' });
    await up.getByRole('button', { name: 'Create team' }).click();
    await expect(up.getByText('Created School B U16A')).toBeVisible();
    const teams = await listDocs<{ name: string; schoolId: string }>('teams');
    teamAId = teams.find((t) => t.name === 'School A U16A')!.id;
    teamBId = teams.find((t) => t.name === 'School B U16A')!.id;
    expect(teams.find((t) => t.id === teamBId)!.schoolId).toBe(schoolBId);

    const cp = coach.page;
    await cp.goto(`/app/teams/${teamAId}`);
    const counter = cp.locator('[aria-label$="over-age"]');
    await expect(counter).toHaveText('0/3');
    await cp.getByRole('button', { name: 'Add player' }).click();
    const dlg = cp.getByRole('dialog');
    const add = async (name: string) => dlg.locator('li', { hasText: name }).getByRole('button', { name: 'Add' }).click();
    // unverified player cannot be added: no Add button, a link to finish registration
    const rudo = dlg.locator('li', { hasText: 'Rudo Sibanda' });
    await expect(rudo).toContainText('Draft');
    await expect(rudo.getByRole('button', { name: 'Add' })).toHaveCount(0);
    await expect(rudo.getByRole('link', { name: 'Finish registration' })).toBeVisible();

    await add('Blessing Mutasa'); await expect(counter).toHaveText('1/3');
    await add('Courage Ndlovu'); await expect(counter).toHaveText('2/3');
    await add('Prosper Zhou'); await expect(counter).toHaveText('3/3');
    await shot(cp, '17-team-roster-3of3');
    // exactly 18 today is NOT over-age: allowed, count unchanged
    await add('Elvis Chigumba');
    await expect(cp.locator('li', { hasText: 'Elvis Chigumba' }).filter({ hasText: 'Over-age' })).toHaveCount(0);
    await expect(counter).toHaveText('3/3');
    // 4th over-age player is blocked with a clear message naming them
    await add('Wisdom Hove');
    const err = cp.getByRole('dialog', { name: 'Over-age limit reached' });
    await expect(err).toBeVisible();
    await expect(err).toContainText('at most 3 over-age players');
    for (const n of ['Blessing Mutasa', 'Courage Ndlovu', 'Prosper Zhou', 'Wisdom Hove']) await expect(err).toContainText(n);
    await shot(cp, '18-overage-blocked');
    await err.getByRole('button', { name: 'OK' }).click();
    // others (not over-age today): Moyo, Dube, and the player who turns 19 on the match day
    await add('Tendai Moyo'); await add('Kuda Dube');
    await add('Gift Marufu');
    await expect(counter).toHaveText('3/3');
    await expect(dlg.locator('li', { hasText: 'Gift Marufu' })).toHaveCount(0); // moved from candidates to the squad
    await cp.getByRole('button', { name: 'Close' }).click();
    await expect(cp.getByRole('link', { name: 'Gift Marufu' })).toBeVisible();
    const roster = await readDoc<{ playerIds: string[]; overAgeIds: string[] }>(`teamRosters/${teamAId}`);
    expect(roster!.overAgeIds.sort()).toEqual(['seed_over0', 'seed_over1', 'seed_over2']);
    expect(roster!.playerIds).toHaveLength(7);
    expect(roster!.playerIds).not.toContain('seed_over3');
    // staff
    await cp.getByRole('button', { name: 'Add staff' }).click();
    await cp.getByRole('dialog').locator('li', { hasText: 'Simba Chuma' }).getByRole('button', { name: 'Add' }).click();
    await cp.getByRole('button', { name: 'Close' }).click();
    await expect(cp.getByText('Head coach').filter({ visible: true }).first()).toBeVisible();
    await audit(coach, '19-team-detail');
  });

  await test.step('6. Match, team sheet (name list blocks, over-age at match date), submit, approve', async () => {
    const page = sa.page;
    await page.goto('/app/matches/new');
    await page.getByLabel(/^Home team/).selectOption({ label: `School A U16A (${today.getFullYear()})` });
    await page.getByLabel(/^Away team/).selectOption({ label: `School B U16A (${today.getFullYear()})` });
    await page.getByLabel(/^Date/).fill(MATCH_DATE);
    await page.getByLabel(/^Venue/).fill('Main Oval');
    await page.getByLabel(/^Town/).fill('Harare');
    await page.getByLabel(/^Competition/).fill('Schools League');
    await page.getByLabel(/^Referee/).fill('Mr Referee');
    await audit(sa, '20-match-form');
    await page.getByRole('button', { name: 'Create match' }).click();
    await expect(page).toHaveURL(/\/app\/matches\/(?!new)\w+$/);
    matchId = page.url().split('/').pop()!;
    await audit(sa, '21-match-admin');

    const cp = coach.page;
    await cp.goto(`/app/matches/${matchId}`);
    await cp.getByRole('link', { name: 'Build sheet' }).first().click();
    await expect(cp).toHaveURL(new RegExp(`/sheet/${teamAId}$`));
    await cp.getByRole('tab', { name: 'Upload list' }).click();
    const squadNames = ['Gift Marufu', 'Blessing Mutasa', 'Courage Ndlovu', 'Prosper Zhou', 'Elvis Chigumba', 'Tendai Moyo', ...NORMAL];
    await cp.getByLabel('Paste names').fill([...squadNames, 'Zanele Phiri'].join('\n'));
    await cp.getByRole('button', { name: 'Match names' }).click();
    await expect(cp.getByText('Not registered', { exact: true })).toBeVisible();
    await expect(cp.getByRole('link', { name: 'Register this player' })).toBeVisible();
    await cp.getByRole('button', { name: /^Use 16 matched players/ }).click();
    // unregistered name blocks submission
    await cp.getByRole('tab', { name: 'Upload list' }).click();
    await cp.getByRole('button', { name: 'Match names' }).click();
    await expect(cp.getByText(/need attention before this sheet can be submitted/)).toBeVisible();
    await cp.getByRole('tab', { name: 'Pick from squad' }).click();
    await expect(cp.getByText('"Zanele Phiri" is not registered.')).toBeVisible();
    // no captain yet: the message says how to choose one
    await expect(cp.getByText(/Choose a captain: tap a player on the pitch below, then tap "Make captain"/)).toBeVisible();
    await expect(cp.getByRole('button', { name: 'Submit for approval' })).toBeDisabled();
    // 4 over-age on the match day (including the one who turns 19 that day)
    const alert = cp.locator('ul[aria-live="polite"]');
    await expect(alert).toContainText('4 players are over 18 on match day');
    await expect(alert).toContainText('Gift Marufu');
    await expect(cp.locator('[aria-label$="over-age players"]')).toHaveText('4/3');
    await shot(cp, '22-sheet-blocked');
    // drop the unregistered line, rematch, apply again
    await cp.getByRole('tab', { name: 'Upload list' }).click();
    await cp.getByLabel('Paste names').fill(squadNames.join('\n'));
    await cp.getByRole('button', { name: 'Match names' }).click();
    await cp.getByRole('button', { name: /^Use 16 matched players/ }).click();
    // remove Prosper (jersey 4) -> 15 players, 3 over-age
    await cp.getByRole('button', { name: /^Jersey 4,/ }).click();
    await cp.getByRole('button', { name: 'Remove from sheet' }).click();
    await expect(cp.locator('[aria-label$="over-age players"]')).toHaveText('3/3');
    await expect(cp.getByText('Over-age: Gift Marufu')).toBeVisible();
    // the over-age badge is based on the match date: Prosper shows it in the picker, Kuda does not
    await cp.getByRole('button', { name: /^Jersey 4, empty/ }).click();
    const picker = cp.getByRole('dialog');
    await expect(picker.locator('button', { hasText: 'Prosper Zhou' })).toContainText('Over-age');
    await expect(picker.locator('button', { hasText: 'Kuda Dube' })).not.toContainText('Over-age');
    await picker.locator('button', { hasText: 'Kuda Dube' }).click();
    await expect(cp.getByRole('button', { name: /^Jersey 4, Kuda Dube/ })).toBeVisible();
    // captain
    await cp.getByRole('button', { name: /^Jersey 6,/ }).click();
    await cp.getByRole('button', { name: 'Make captain' }).click();
    await cp.getByRole('button', { name: 'Done' }).click();
    await expect(cp.getByText('Ready to submit.')).toBeVisible();
    await audit(coach, '23-sheet-ready');
    await cp.getByRole('button', { name: 'Submit for approval' }).click();
    await expect(cp).toHaveURL(new RegExp(`/app/matches/${matchId}$`));
    const sheet = await readDoc<{ status: string; overAgeCount: number; entries: unknown[] }>(`matches/${matchId}/sheets/${teamAId}`);
    expect(sheet).toMatchObject({ status: 'submitted', overAgeCount: 3 });
    expect(sheet!.entries).toHaveLength(16);

    const rp = registrar.page;
    await rp.goto('/app/sheets');
    await expect(rp.getByText(/over-age 3\/3/)).toBeVisible();
    await audit(registrar, '24-sheet-review');
    await rp.getByRole('button', { name: 'Approve' }).click();
    await expect(rp.getByText('Sheet approved.')).toBeVisible();
    expect((await readDoc<{ status: string }>(`matches/${matchId}/sheets/${teamAId}`))!.status).toBe('approved');
  });

  await test.step('7. Scorer records try, conversion, penalty (=10), undo, final; school locked, union can correct', async () => {
    const page = scorer.page;
    await page.goto(`/app/matches/${matchId}/score`);
    const score = page.locator('span[aria-live="polite"]');
    await expect(score).toHaveText('0 - 0');
    const record = async (action: RegExp, minute: string, player: string, points: number) => {
      await page.getByRole('button', { name: action }).first().click();
      await page.getByLabel('Minute').fill(minute);
      await page.getByRole('dialog').getByRole('button', { name: new RegExp(player) }).click();
      await page.getByRole('button', { name: `Record +${points}` }).click();
    };
    await record(/^Try \+5/, '10', 'Tendai Moyo', 5);
    await expect(score).toHaveText('5 - 0');
    await record(/^Conversion \+2/, '10', 'Tendai Moyo', 2);
    await expect(score).toHaveText('7 - 0');
    await record(/^Penalty \+3/, '25', 'Gift Marufu', 3);
    await expect(score).toHaveText('10 - 0');
    await audit(scorer, '25-scoring');
    await record(/^Penalty \+3/, '30', 'Gift Marufu', 3);
    await expect(score).toHaveText('13 - 0');
    await page.getByRole('button', { name: 'Undo last' }).click();
    await page.getByRole('dialog', { name: 'Undo the last event?' }).getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(score).toHaveText('10 - 0');
    await page.getByRole('button', { name: 'Mark as final' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Mark final' }).click();
    await expect(page.getByText('Full time').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^Try \+5/ }).first()).toBeDisabled();
    // The screen updates from the local write, so wait for the server to have it.
    await expect.poll(() => readDoc(`matches/${matchId}`)).toMatchObject({ status: 'final', homeScore: 10, awayScore: 0 });

    // School can no longer edit
    const cp = coach.page;
    await cp.goto(`/app/matches/${matchId}/score`);
    await expect(cp.getByText(/Only the union can change a final result/)).toBeVisible();
    await expect(cp.getByRole('button', { name: /^Try \+5/ }).first()).toBeDisabled();
    await expect(cp.getByRole('button', { name: 'Undo last' })).toBeDisabled();
    await audit(coach, '26-score-locked-for-school');

    // Union can correct
    const up = union.page;
    await up.goto(`/app/matches/${matchId}/score`);
    await expect(up.locator('span[aria-live="polite"]')).toHaveText('10 - 0');
    await up.getByRole('button', { name: /^Drop goal \+3/ }).last().click();
    await up.getByLabel('Minute').fill('70');
    await up.getByLabel(/Player name|Or type a name/).fill('Sam Visitor');
    await up.getByRole('button', { name: 'Record +3' }).click();
    await expect(up.locator('span[aria-live="polite"]')).toHaveText('10 - 3');
    await up.getByRole('button', { name: 'Undo last' }).click();
    await up.getByRole('dialog', { name: 'Undo the last event?' }).getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(up.locator('span[aria-live="polite"]')).toHaveText('10 - 0');
    await expect.poll(async () => (await readDoc<{ awayScore: number; status: string }>(`matches/${matchId}`))).toMatchObject({ awayScore: 0, status: 'final' });
  });

  await test.step('8. Public pages: results, match, logs, no personal data, /app redirects when signed out', async () => {
    // sign the school admin out through the UI too
    await signOut(sa);
    const pub = await open();
    const p = pub.page;
    await p.goto('/results');
    const card = p.getByRole('link', { name: /School A U16A/ });
    await expect(card).toContainText('10 - 0');
    await audit(pub, '27-public-results');
    await card.click();
    await expect(p).toHaveURL(new RegExp(`/matches/${matchId}$`));
    await expect(p.getByText('Try · T. Moyo')).toBeVisible();
    // same minute: shown in the order recorded (try before its conversion)
    const order = await p.locator('ol li').allInnerTexts();
    expect(order.findIndex((t) => t.includes('Try'))).toBeLessThan(order.findIndex((t) => t.includes('Conversion')));
    await expect(p.getByText('Conversion · T. Moyo')).toBeVisible();
    await expect(p.getByText('Penalty · G. Marufu')).toBeVisible();
    await audit(pub, '28-public-match');

    await p.goto('/logs');
    await p.getByLabel('Season').selectOption(MATCH_YEAR);
    const rowA = p.locator('tbody tr').filter({ hasText: 'School A U16A' });
    await expect(rowA).toBeVisible();
    const cells = async (r: typeof rowA) => (await r.locator('td').allInnerTexts()).map((t) => t.trim()).slice(0, 10); // the Form column after these is hidden on phones
    expect(await cells(rowA)).toEqual(['1', 'School A U16A', '1', '1', '0', '0', '10', '0', '10', '4']);
    expect(await cells(p.locator('tbody tr').filter({ hasText: 'School B U16A' }))).toEqual(['2', 'School B U16A', '1', '0', '0', '1', '0', '10', '-10', '0']);
    // the log table must be fully readable on a phone (no clipped columns inside its own scroller)
    await p.setViewportSize({ width: 360, height: 800 });
    const fit = await p.locator('table').evaluate((t) => ({ t: t.scrollWidth, w: (t.parentElement as HTMLElement).clientWidth }));
    await p.setViewportSize({ width: 390, height: 844 });
    expect(fit.t, 'log table wider than its container at 360px').toBeLessThanOrEqual(fit.w);
    await audit(pub, '29-public-logs');

    // No personal data in any public page
    const forbidden = [
      'Tendai', 'Kuda', 'Gift', 'Blessing', 'Courage', 'Prosper', 'Wisdom', 'Elvis', 'Rudo', 'Simba', ...NORMAL.map((n) => n.split(' ')[0]),
      'Mai Moyo', 'Mai Dube', 'mai.moyo@example.test', '0771000002', '0771000001', 'BC-778899', '63-123456', 'SEED-', TURNER_DOB, dobYearsAgo(18, 0),
      dobYearsAgo(16, 100), 'Seed Guardian',
    ];
    for (const path of ['/', '/fixtures', '/results', '/logs', '/schools', `/schools/${schoolAId}`, `/matches/${matchId}`]) {
      await p.goto(path);
      await p.waitForTimeout(2000);
      const html = await p.evaluate(() => document.body.innerHTML);
      for (const f of forbidden) expect(html, `${path} must not contain "${f}"`).not.toContain(f);
      await expectNoHScroll(p, `public ${path}`);
    }
    await p.goto('/app');
    await expect(p).toHaveURL(/\/login/);
    await p.goto('/app/players');
    await expect(p).toHaveURL(/\/login/);
    await audit(pub, '30-login-redirect');
  });

  expectNoConsoleErrors(union, 'union session');
  expectNoConsoleErrors(sa, 'school admin session');
  expectNoConsoleErrors(registrar, 'registrar session');
  expectNoConsoleErrors(coach, 'coach session');
  expectNoConsoleErrors(scorer, 'scorer session');
  void [schoolBId, shot, expectNoHScroll, signOut];
});

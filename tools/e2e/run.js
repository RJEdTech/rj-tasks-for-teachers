/*
  End-to-end test of RJ Tasks for Teachers in real Chromium against the mock
  teacher Canvas (tools/mock-canvas/server.py on 127.0.0.1:8444).

  E2E=1 node tools/build.js && node tools/e2e/run.js build-e2e e2e-shots
  (The e2e build differs from the shipped build only in using an open shadow
  root so the test can look inside the panel.)
*/
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const BUILD = path.resolve(process.argv[2] || 'build-e2e');
const OUT = path.resolve(process.argv[3] || 'e2e-shots');
const PORT = process.env.MOCK_PORT || '8444';
const BASE = 'https://rjhs.instructure.com';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const profile = fs.mkdtempSync('/tmp/claude-0/rjtt-profile-');
  const ctx = await chromium.launchPersistentContext(profile, {
    executablePath: '/opt/pw-browsers/chromium',
    headless: true,
    viewport: { width: 1280, height: 800 },
    timezoneId: 'America/Denver',
    ignoreHTTPSErrors: true,
    permissions: ['clipboard-read', 'clipboard-write'],
    args: [
      `--disable-extensions-except=${BUILD}`,
      `--load-extension=${BUILD}`,
      `--host-resolver-rules=MAP rjhs.instructure.com:443 127.0.0.1:${PORT}`,
      '--no-proxy-server',
      '--ignore-certificate-errors',
      '--headless=new',
    ],
  });

  const offsite = [];
  const writes = [];
  ctx.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(BASE) && !u.startsWith('chrome-extension://') && !u.startsWith('data:')) offsite.push(u);
    if (u.startsWith(BASE) && r.method() !== 'GET') writes.push(`${r.method()} ${u}`);
  });

  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const extId = sw.url().split('/')[2];
  check('extension loads', !!extId, extId);

  const errors = [];
  const watch = (p) => {
    p.on('pageerror', (e) => errors.push(String(e)));
    p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
    p.on('dialog', (d) => {
      errors.push('DIALOG ' + d.message());
      void d.dismiss();
    });
  };

  const page = await ctx.newPage();
  watch(page);
  await page.goto(BASE + '/__as_teacher');

  const host = 'div[data-rjtt]';
  const $ = (sel) => page.locator(`${host} >> css=${sel}`);
  const text = async (sel) => (await $(sel).first().textContent()) || '';
  const bodyText = () => text('.body');
  const waitBody = async (re) => {
    for (let i = 0; i < 50; i++) {
      const t = await bodyText().catch(() => '');
      if (re.test(t) && !/^Loading/.test(t)) return t;
      await sleep(100);
    }
    return bodyText();
  };
  const tab = async (name) => {
    await $(`.tab[data-tab="${name}"]`).click();
  };

  const C = 'div[data-rjtt-card]';
  const $c = (sel) => page.locator(`${C} >> css=${sel}`);
  const cardText = async () => ((await $c('.card').first().textContent()) || '').replace(/\s+/g, ' ');
  const waitCard = async () => {
    for (let i = 0; i < 80; i++) {
      const t = await cardText().catch(() => '');
      if (t && !/Loading/.test(t)) return t;
      await sleep(100);
    }
    return cardText();
  };

  // ---------- dashboard: sidebar card ----------
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.locator(C).waitFor({ timeout: 10000 });
  const placement = await page.evaluate(() => {
    const host = document.querySelector('div[data-rjtt-card]');
    return host.parentElement.id + '|' + (host.nextElementSibling && host.nextElementSibling.className);
  });
  check('Dashboard: card sits in Canvas\'s right sidebar, above To Do', placement === 'right-side|todo-list-header', placement);
  let ct = await waitCard();
  check('Dashboard card: To grade count and oldest-first rows', /To grade\s*15/.test(ct) && (await $c('.list li').count()) === 3, ct.slice(0, 160));
  check('Dashboard card: rows link to SpeedGrader', (await $c('.list a').first().getAttribute('href')) === `${BASE}/courses/101/gradebook/speed_grader?assignment_id=1001`);
  check('Dashboard card: Check-up summary', /4 to fix · 3 worth a look/.test(ct), ct);
  check('Dashboard card: Students as a count only, never names', /3 students with 3\+ missing/.test(ct) && !/Casey|Avery|Harper|img/.test(ct), ct);
  check('Dashboard card: Week strip of 7 days', (await $c('.strip li').count()) === 7 && /items? due in the next 7 days/.test(ct));
  check('Dashboard card: only this semester\'s classes', !/EDTECH|RAIDERQUEST|DEMO|THEOLOGY 1 S2/.test(ct));
  check('Dashboard: no floating button while the card is showing', !(await $('.launcher').isVisible()));
  await page.waitForFunction(() => {
    const h = document.querySelector('div[data-rjtt]');
    const b = h && h.shadowRoot && h.shadowRoot.querySelector('.badge');
    return b && b.textContent === '15';
  }, null, { timeout: 5000 }).catch(() => undefined);
  check('badge uses the same count as To grade', (await text('.badge')) === '15', await text('.badge'));
  await page.screenshot({ path: path.join(OUT, '0-dashboard-card.png') });
  await page.locator(C).screenshot({ path: path.join(OUT, '0b-card.png') });

  await $c('.sec[data-sec="week"] .sec-head').click();
  await $('.panel').waitFor();
  check('card: a section opens the full view at that tab', (await $('.tab[data-tab="week"]').getAttribute('aria-selected')) === 'true');
  await page.keyboard.press('Escape');
  await sleep(150);
  await $c('.open').click();
  await $('.panel').waitFor();
  const focused = await page.evaluate(() => {
    const h = document.querySelector('div[data-rjtt]');
    return h.shadowRoot.activeElement && h.shadowRoot.activeElement.id;
  });
  check('panel opens with focus on its heading', focused === 'rjtt-title', focused);
  const scopeOpts = await $('select#rjtt-scope option').allTextContents();
  check(
    'only this semester\'s classes you teach (other terms, ended and student enrollments left out)',
    scopeOpts.length === 4 && scopeOpts[0] === 'All my classes (3)' && !scopeOpts.some((o) => /2025|PD|RAIDERQUEST|DEMO|S2/.test(o)),
    scopeOpts.join(' | ')
  );

  // ---------- To grade ----------
  let t = await waitBody(/to grade/);
  check('To grade: totals across classes', /15 submissions to grade in 4 assignments/.test(t), t.slice(0, 80));
  const titles = await $('.body .row .title').allTextContents();
  check('To grade: oldest wait first', titles.join('|') === 'Unit 2 Test|Proofs worksheet|HW 2.6 Review|HW 2.4 Factoring', titles.join('|'));
  check('To grade: counts late, resubmitted, quiz review', /1 late/.test(t) && /1 resubmitted/.test(t) && /1 quiz answer to review/.test(t));
  check('To grade: old waits are marked', (await $('.body .row.old').count()) === 1);
  const sgHref = await $('.body .row a.title').first().getAttribute('href');
  check('To grade: links straight to SpeedGrader', sgHref === `${BASE}/courses/101/gradebook/speed_grader?assignment_id=1001`, sgHref);
  check('To grade: tab shows count', /To grade\s*15/.test(await text('.tab[data-tab="grade"]')));
  await page.screenshot({ path: path.join(OUT, '1-to-grade.png') });

  // ---------- Check-up ----------
  await tab('checkup');
  t = await waitBody(/to fix|No setup/);
  const rules = await $('.body .row').evaluateAll((els) => els.map((e) => e.getAttribute('data-rule')));
  check(
    'Check-up: finds each kind of setup problem',
    ['weights_total', 'no_due_date', 'unpublished_due', 'locks_before_due', 'zero_weight_group', 'zero_points', 'midnight_due'].every((r) =>
      rules.includes(r)
    ) && rules.length === 7,
    rules.join(',')
  );
  check('Check-up: fixes listed before checks', /4 to fix, 3 worth a look/.test(t), t.slice(0, 60));
  check('Check-up: midnight wording names both nights', /12:00 AM on .*which is the end of/.test(t));
  const editHref = await $('.body .row[data-rule="no_due_date"] a').getAttribute('href');
  check('Check-up: links to the assignment edit page', editHref === `${BASE}/courses/101/assignments/1008/edit`, editHref);
  await page.screenshot({ path: path.join(OUT, '2-check-up.png') });
  await $('.body .row[data-rule="zero_points"] button').click();
  t = await waitBody(/ignored/);
  check('Check-up: Ignore hides an item and offers to show it again', !/Warm-up log/.test(t) && /1 item ignored/.test(t));

  // ---------- Students ----------
  await tab('students');
  t = await waitBody(/missing this grading period/);
  check('Students: names hidden by default', !/Casey|Avery|Harper|img/.test(t) && /Names are hidden/.test(t), t.slice(0, 120));
  check('Students: per-class count while hidden', /ALGEBRA 1\s*3 students/.test(t), t.slice(0, 200));
  await page.screenshot({ path: path.join(OUT, '3-students-hidden.png') });
  await $('.privacy button').click();
  t = await waitBody(/Hide names/);
  const names = await $('.body details summary .plain').allTextContents();
  check(
    'Students: most missing first; auto-graded missing work counts; excused and dropped do not',
    names.length === 3 && /Test$/.test(names[0]) && names[1] === 'Casey Ellis' && names[2] === 'Harper Jones' && !/Dropped/.test(t),
    names.join(' | ')
  );
  const imgs = await page.evaluate(() => document.querySelector('div[data-rjtt]').shadowRoot.querySelectorAll('img').length);
  check('Students: a name containing HTML shows as text, not an image', imgs === 0 && /<img src=x/.test(t));
  const gradesHref = await $('.body details a').nth(1).getAttribute('href');
  check('Students: links to the student grades page', gradesHref === `${BASE}/courses/101/grades/9002`, gradesHref);
  await $('.body details').nth(1).click();
  await $('.body .actions button:has-text("Copy list")').click();
  await sleep(200);
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check('Students: Copy list gives plain text', /^ALGEBRA 1 · Algebra 1\n.*Casey Ellis \(3 missing\): HW 2.4 Factoring; HW 2.5 Quadratics; HW 2.6 Review/s.test(clip), clip.slice(0, 80));
  await $('.body select').selectOption('4');
  for (let i = 0; i < 30 && (await $('.body details').count()) !== 1; i++) await sleep(100);
  check('Students: threshold change narrows the list', (await $('.body details').count()) === 1 && !/Harper/.test(await bodyText()));
  await $('.body select').selectOption('3');
  await waitBody(/missing this grading period/);

  // close and reopen: names hidden again
  await page.keyboard.press('Escape');
  await sleep(150);
  const panelGone = !(await $('.panel').isVisible());
  const focusBack = await page.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-rjtt-card'));
  check('Escape closes the panel and returns focus to the sidebar card', panelGone && focusBack, String(focusBack));
  await $c('.open').click();
  await tab('students');
  t = await waitBody(/missing this grading period/);
  check('Students: names hide again after closing the panel', /Names are hidden/.test(t) && !/Casey/.test(t));

  // ---------- Week ----------
  await tab('week');
  t = await waitBody(/next 7 days/);
  check('Week: 7 days listed', (await $('.body .day').count()) === 7);
  const flags = await $('.body .flag').allTextContents();
  check(
    'Week: flags 2+ graded items for one class / one section',
    flags.length === 2 && /ALGEBRA 1: 2 graded/.test(flags[0]) && /GEOMETRY · Period 3: 2 graded/.test(flags[1]),
    flags.join(' | ')
  );
  check('Week: unpublished and ungraded items do not add to flags', !/Unit 3 Test/.test(t));
  check('Week: a one-student extension is labeled and not counted', /Essay draft\s*1 student/.test(t) && !/ALGEBRA 1: 3 graded/.test(t));
  check('Week: says it only covers your classes', /Canvas doesn't let teachers see/.test(t));
  await page.screenshot({ path: path.join(OUT, '4-week.png') });

  // ---------- course home: card for that class ----------
  await page.goto(BASE + '/courses/102', { waitUntil: 'domcontentloaded' });
  await page.locator(C).waitFor({ timeout: 10000 });
  const cplace = await page.evaluate(() => document.querySelector('div[data-rjtt-card]').previousElementSibling.id);
  check('course home: card sits under the teacher buttons', cplace === 'course_show_secondary', cplace);
  ct = await waitCard();
  check('course home: card is for that class only', /This class/.test(ct) && /To grade\s*4/.test(ct) && !/ALGEBRA/.test(ct), ct.slice(0, 120));
  await $c('.sec[data-sec="grade"] .sec-head').click();
  t = await waitBody(/to grade|Nothing/);
  const scopeVal = await $('select#rjtt-scope').inputValue();
  check('course home: full view starts on that class', scopeVal === '102' && /4 submissions to grade in 1 assignment/.test(t), `${scopeVal} ${t.slice(0, 50)}`);
  await page.screenshot({ path: path.join(OUT, '4b-course-home.png') });

  await page.goto(BASE + '/courses/102/assignments', { waitUntil: 'domcontentloaded' });
  await $('.launcher').waitFor({ timeout: 10000 });
  check('other class pages: floating button, no card', (await page.locator(C).count()) === 0);
  await page.goto(BASE + '/courses/301', { waitUntil: 'domcontentloaded' });
  await $('.launcher').waitFor({ timeout: 10000 });
  check('home page of a non-semester course (PD): no card', (await page.locator(C).count()) === 0);

  // ---------- narrow window: Canvas hides its sidebar ----------
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.locator(C).waitFor({ state: 'attached', timeout: 10000 });
  await $('.launcher').waitFor({ timeout: 5000 }).catch(() => undefined);
  check('narrow window: sidebar hidden, so the floating button appears', await $('.launcher').isVisible());
  await page.setViewportSize({ width: 1280, height: 800 });
  await sleep(400);
  check('wide again: button steps aside for the card', !(await $('.launcher').isVisible()));

  // ---------- dark mode ----------
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(BASE + '/?dark=1', { waitUntil: 'domcontentloaded' });
  await page.locator(C).waitFor();
  await $c('.open').click();
  await waitBody(/to grade/);
  const bg = await $('.panel').evaluate((e) => getComputedStyle(e).backgroundColor);
  check('dark mode: neutral charcoal panel', bg === 'rgb(21, 22, 26)', bg);
  await page.screenshot({ path: path.join(OUT, '5-dark.png') });
  await page.emulateMedia({ colorScheme: 'light' });

  // ---------- grading pages ----------
  await page.goto(BASE + '/courses/101/gradebook/speed_grader?assignment_id=1001', { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  check('SpeedGrader: button stays out of the way', !(await $('.launcher').isVisible().catch(() => false)));

  // ---------- planted content ----------
  await page.goto(BASE + '/planted', { waitUntil: 'domcontentloaded' });
  await $('.launcher').waitFor();
  await page.locator('#main button[data-rjtt]').click();
  await sleep(300);
  check('planted look-alike in page content does nothing', !(await $('.panel').isVisible().catch(() => false)));

  // ---------- settings page ----------
  const opt = await ctx.newPage();
  watch(opt);
  await opt.goto(`chrome-extension://${extId}/options.html`);
  await opt.waitForSelector('#classes label');
  const classLabels = await opt.locator('#classes label').allTextContents();
  check('settings: lists your classes', classLabels.length === 3, classLabels.join(' | '));
  await opt.locator('#classes label', { hasText: 'ADVISEMENT' }).locator('input').uncheck();
  await opt.waitForSelector('#saved:has-text("Saved")');
  await opt.screenshot({ path: path.join(OUT, '6-settings.png'), fullPage: true });
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.locator(C).waitFor();
  await $c('.open').click();
  await waitBody(/to grade/);
  const after = await $('select#rjtt-scope option').allTextContents();
  check('settings: a class turned off disappears from the panel', after[0] === 'All my classes (2)' && !after.some((o) => /ADVISEMENT/.test(o)), after.join(' | '));

  await opt.bringToFront();
  await opt.locator('#semesterOnly').uncheck();
  await opt.waitForSelector('#saved:has-text("Saved")');
  await page.bringToFront();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.locator(C).waitFor();
  await $c('.open').click();
  await waitBody(/to grade/);
  const wide = await $('select#rjtt-scope option').allTextContents();
  check('settings: "Only this semester" off brings back PD and other courses', wide[0] === 'All my classes (6)' && wide.some((o) => /EDTECH/.test(o)), wide.join(' | '));
  await opt.locator('#semesterOnly').check();
  await opt.waitForSelector('#saved:has-text("Saved")');

  const pop = await ctx.newPage();
  watch(pop);
  await pop.setViewportSize({ width: 320, height: 330 });
  await pop.goto(`chrome-extension://${extId}/popup.html`);
  check('popup renders', /Open Canvas/.test(await pop.textContent('body')));
  await pop.screenshot({ path: path.join(OUT, '7-popup.png') });

  // ---------- not a teacher ----------
  const stu = await ctx.newPage();
  watch(stu);
  await stu.goto(BASE + '/__as_student');
  await stu.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await sleep(2000);
  check('student: no button and no card', (await stu.locator('div[data-rjtt]').count()) === 0 && (await stu.locator('div[data-rjtt-card]').count()) === 0);
  await stu.goto(BASE + '/__as_teacher');

  // ---------- network ----------
  await page.goto(BASE + '/__writes');
  const serverWrites = JSON.parse(((await page.textContent('body')) || '[]').replace(/^while\(1\);/, ''));
  check('read-only: no POST/PUT/PATCH/DELETE ever sent', writes.length === 0 && serverWrites.length === 0, writes.concat(serverWrites).join(', '));
  check('no requests to any other site', offsite.length === 0, offsite.slice(0, 3).join(', '));
  check('no page errors or dialogs', errors.length === 0, errors.slice(0, 3).join(' | '));

  await ctx.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

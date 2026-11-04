/*
  The sidebar card: a compact summary of To grade, Check-up, Students and
  Week, placed in Canvas's own right sidebar on the Dashboard (all classes)
  and on a course's home page (that class only). Each section opens the full
  panel at that view. Lives in a closed shadow root like the panel, and uses
  the same in-memory Loader, so opening the panel downloads nothing twice.

  Student names never appear here: the sidebar is always on screen, so it
  only ever shows counts.

  Canvas load: the summary is kept in this tab's sessionStorage for 5
  minutes (counts, course codes and assignment titles only), so going back
  to the Dashboard doesn't ask Canvas for everything again. Sections load one
  after another, not all at once, and Students (the heaviest) goes last.
*/
import { canvasLink } from '../lib/canvasApi';
import { PD_COURSE_PATH } from '../lib/constants';
import { Settings, loadIgnored, loadSettings, saveSettings } from '../lib/settings';
import { TeacherCourse } from '../lib/types';
import { Loader } from '../data/loader';
import { GradingRow } from '../data/grading';
import { WeekDay } from '../data/week';
import { waitingFor } from '../lib/dates';
import { CARD_CSS } from './styles';
import { append, clear, h, plural } from './dom';
import type { Tab } from './panel';

declare const SHADOW_MODE: 'open' | 'closed';

const TOP_ROWS = 3;
const CACHE_PREFIX = 'rjtt-card-v1:';
const CACHE_TTL_MS = 5 * 60 * 1000;
const DAY_LETTER = new Intl.DateTimeFormat('en-US', { weekday: 'narrow' });
const DAY_NAME = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
const LABELS: Record<Tab, string> = { grade: 'To grade', checkup: 'Check-up', students: 'Students', week: 'Week' };
const SUMMARY_KEY = { grade: 'grade', checkup: 'checkup', students: 'students', week: 'week' } as const;

/* What the card shows. Plain data, so it can be cached as JSON. No student names. */
export interface GradeSummary {
  total: number;
  assignments: number;
  rows: Array<{ courseId: string; code: string; assignmentId: string; name: string; count: number; oldest: number | null }>;
}
export interface CheckupSummary {
  fix: number;
  check: number;
  top: Array<{ code: string; title: string }>;
}
export interface StudentsSummary {
  n: number;
  periodKnown: boolean;
}
export interface WeekSummary {
  total: number;
  days: Array<{ at: number; n: number; flagged: boolean }>;
}
export interface CardSummary {
  grade?: GradeSummary | null; // null = couldn't load
  checkup?: CheckupSummary | null;
  students?: StudentsSummary | null;
  week?: WeekSummary | null;
}

export function summarizeGrade(rows: GradingRow[]): GradeSummary {
  return {
    total: rows.reduce((n, r) => n + r.count, 0),
    assignments: rows.length,
    rows: rows.slice(0, TOP_ROWS).map((r) => ({
      courseId: r.course.id,
      code: r.course.code,
      assignmentId: r.assignmentId,
      name: r.name,
      count: r.count,
      oldest: r.oldest ? r.oldest.getTime() : null,
    })),
  };
}

export function summarizeWeek(days: WeekDay[]): WeekSummary {
  return {
    total: days.reduce((n, d) => n + d.items.length, 0),
    days: days.map((d) => ({ at: d.date.getTime(), n: d.items.length, flagged: d.flags.length > 0 })),
  };
}

function readCache(key: string, want: Tab[]): CardSummary | null {
  try {
    const raw = window.sessionStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const v = JSON.parse(raw) as { t?: unknown; s?: unknown };
    if (typeof v.t !== 'number' || Date.now() - v.t > CACHE_TTL_MS || !v.s || typeof v.s !== 'object') return null;
    const s = v.s as CardSummary;
    // only a complete summary is reused
    return want.every((t) => !!s[SUMMARY_KEY[t]]) ? s : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, s: CardSummary): void {
  try {
    window.sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), s }));
  } catch {
    /* storage full or blocked: just load again next time */
  }
}

export function clearCardCache(): void {
  try {
    for (let i = window.sessionStorage.length - 1; i >= 0; i--) {
      const k = window.sessionStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) window.sessionStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}

export interface CardOptions {
  loader: Loader;
  settings: Settings;
  /* null on the Dashboard (all classes); a course id on that course's home page */
  courseId: string | null;
  onOpen: (tab: Tab) => void;
  /* the To grade total, for the badge; called only for the latest load */
  onGradeCount?: (n: number) => void;
  now?: () => Date;
}

export class SidebarCard {
  readonly host: HTMLElement;
  private root: ShadowRoot;
  private wrap: HTMLElement;
  private sections = new Map<Tab, HTMLElement>();
  private token = 0;
  private lastTab: Tab | null = null;
  private now: () => Date;

  constructor(private opts: CardOptions) {
    this.now = opts.now ?? (() => new Date());
    this.host = document.createElement('div');
    this.host.setAttribute('data-rjtt-card', '');
    this.root = this.host.attachShadow({ mode: SHADOW_MODE });
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(CARD_CSS);
      this.root.adoptedStyleSheets = [sheet];
    } catch {
      const style = document.createElement('style');
      style.textContent = CARD_CSS;
      this.root.appendChild(style);
    }
    this.wrap = h('section', { class: 'card', 'aria-labelledby': 'rjtt-card-title' });
    this.root.appendChild(this.wrap);
    // Remember what had keyboard focus, in case Canvas re-renders its
    // sidebar and the card has to be put back (which drops focus).
    this.wrap.addEventListener('focusin', (e) => {
      const t = e.target as HTMLElement;
      this.lastFocus = { cls: t.className, sec: t.closest('.sec')?.getAttribute('data-sec') ?? null };
    });
    this.wrap.addEventListener('focusout', () => (this.lostAt = Date.now()));
  }

  private lastFocus: { cls: string; sec: string | null } | null = null;
  private lostAt = 0;

  /* After the card is moved back into the sidebar: if it had focus a moment
     ago and nothing else has it now, give it back. */
  refocusAfterMove(): void {
    const idle = document.activeElement === document.body || document.activeElement === null;
    if (!this.lastFocus || !idle || Date.now() - this.lostAt > 1000) return;
    const f = this.lastFocus;
    const el = f.sec
      ? this.sections.get(f.sec as Tab)?.querySelector<HTMLElement>('.sec-head')
      : this.wrap.querySelector<HTMLElement>(f.cls === 'hide' ? '.hide' : '.open');
    el?.focus();
  }

  private cacheKey(): string {
    return this.cacheKeyFor(this.opts.settings);
  }

  private cacheKeyFor(s: Settings): string {
    return [
      this.opts.courseId ?? 'all',
      s.allClasses ? 'all' : 'sem',
      s.excludedCourses.slice().sort().join(','),
      s.missingThreshold,
      s.cardHidden.join(','),
      s.checksOff.slice().sort().join(','),
    ].join('|');
  }

  /* What the card's contents depend on. */
  private layoutKey(s: Settings): string {
    return [this.cacheKeyFor(s), s.sectionOrder.join(','), s.cardCollapsed].join('#');
  }

  /* Always keeps the latest settings (so Hide can't save a stale copy);
     reloads only when something the card shows has changed. */
  updateSettings(s: Settings): void {
    const changed = this.layoutKey(s) !== this.layoutKey(this.opts.settings);
    this.opts.settings = s;
    if (changed) void this.load();
  }

  /* After Refresh or Ignore in the panel: drop the cached summary and reload. */
  refresh(): void {
    clearCardCache();
    void this.load();
  }

  /* Focus the section heading that opened the panel (for when it closes). */
  focusLast(): void {
    const tab = this.lastTab ?? this.shown()[0] ?? 'grade';
    const b = this.sections.get(tab)?.querySelector('.sec-head') as HTMLElement | null;
    (b ?? (this.wrap.querySelector('.open') as HTMLElement | null))?.focus();
  }

  private open(tab: Tab): void {
    this.lastTab = tab;
    this.opts.onOpen(tab);
  }

  async load(): Promise<void> {
    const token = ++this.token;
    const live = () => token === this.token;
    const scoped = this.opts.courseId !== null;
    const key = this.cacheKey();
    const summary: CardSummary = {};
    const want = this.shown();

    this.buildShell(scoped, this.opts.settings.cardCollapsed ? [] : want);
    if (this.opts.settings.cardCollapsed) return; // hidden: header only, nothing loaded
    if (!want.length) {
      this.message('All sections are turned off in RJ Tasks settings. Click Open for the full view.');
      return;
    }

    const cached = readCache(key, want);
    if (cached) {
      this.render(cached, scoped);
      if (cached.grade) this.opts.onGradeCount?.(cached.grade.total);
      return;
    }

    let courses: TeacherCourse[];
    let all: TeacherCourse[];
    try {
      all = await this.opts.loader.courses(this.opts.settings.excludedCourses, this.opts.settings.allClasses);
      courses = scoped ? all.filter((c) => c.id === this.opts.courseId) : all;
    } catch {
      if (live()) this.message("Couldn't reach Canvas. Refresh the page to try again.");
      return;
    }
    if (!live()) return;
    if (!courses.length) {
      this.message(
        scoped
          ? 'This class is turned off in RJ Tasks settings.'
          : 'No classes this semester. Classes you turned off in Settings are left out.'
      );
      return;
    }

    const L = this.opts.loader;
    const s = this.opts.settings;

    // One section at a time (not all at once), cheapest first; Students last.
    // Sections turned off in Settings aren't loaded at all.
    const steps: Array<[Tab, () => Promise<void>]> = [
      ['grade', async () => {
        const r = await L.toGrade(courses);
        summary.grade = summarizeGrade(r.value);
        if (live()) this.opts.onGradeCount?.(summary.grade.total);
      }],
      ['week', async () => {
        const r = await L.week(courses);
        summary.week = summarizeWeek(r.value);
      }],
      ['checkup', async () => {
        const r = await L.checkup(courses, await loadIgnored(), s.checksOff, all);
        const fix = r.value.filter((i) => i.severity === 'fix');
        summary.checkup = {
          fix: fix.length,
          check: r.value.length - fix.length,
          top: fix.slice(0, 2).map((i) => ({ code: i.course.code, title: i.title })),
        };
      }],
      ['students', async () => {
        const r = await L.students(courses, s.missingThreshold);
        summary.students = { n: r.value.length, periodKnown: r.periodKnown };
      }],
    ];
    for (const [tab, run] of steps) {
      if (!want.includes(tab)) continue;
      try {
        await run();
      } catch {
        summary[SUMMARY_KEY[tab]] = null;
      }
      if (!live()) return;
      this.render(summary, scoped);
    }
    if (want.every((t) => !!summary[SUMMARY_KEY[t]])) writeCache(key, summary);
  }

  /* Visible sections, in the order chosen in Settings. */
  private shown(): Tab[] {
    const s = this.opts.settings;
    return s.sectionOrder.filter((t) => !s.cardHidden.includes(t));
  }

  private buildShell(scoped: boolean, want: Tab[]): void {
    // Rebuilding removes the focused button; put focus back on its twin.
    const had = (this.root.activeElement as HTMLElement | null)?.className;
    clear(this.wrap);
    this.sections.clear();
    const open = h('button', { class: 'open', type: 'button' }, 'Open');
    open.addEventListener('click', () => this.open(this.shown()[0] ?? this.opts.settings.sectionOrder[0]));
    const collapsed = this.opts.settings.cardCollapsed;
    const hide = h(
      'button',
      { class: 'hide', type: 'button', 'aria-expanded': String(!collapsed), 'aria-label': collapsed ? 'Show the My Classes summary' : 'Hide the My Classes summary' },
      collapsed ? 'Show' : 'Hide'
    );
    hide.addEventListener('click', async () => {
      // Start from the saved settings, not this page's copy, so nothing
      // changed elsewhere (like "Hide student names") is undone.
      const fresh = await loadSettings();
      const next = { ...fresh, cardCollapsed: !collapsed };
      this.opts.settings = next;
      await this.load();
      (this.wrap.querySelector('.hide') as HTMLElement | null)?.focus();
      void saveSettings(next).catch(() => undefined); // every open Canvas tab follows
    });
    this.wrap.append(
      h(
        'div',
        { class: 'head' },
        h('h2', { id: 'rjtt-card-title' }, scoped ? 'This class' : 'My Classes'),
        hide,
        open
      )
    );
    if (had === 'hide') hide.focus();
    else if (had === 'open') open.focus();
    for (const tab of want) {
      const sec = h('div', { class: 'sec', 'data-sec': tab }, this.sectionHead(tab, null), h('p', { class: 'muted' }, 'Loading…'));
      this.sections.set(tab, sec);
      this.wrap.append(sec);
    }
    if (want.length)
      this.wrap.append(
        h(
          'p',
          { class: 'foot' },
          'Questions? ',
          h('a', { href: canvasLink(PD_COURSE_PATH, {}), target: '_blank', rel: 'noopener' }, 'Canvas PD course')
        )
      );
  }

  private message(msg: string): void {
    const head = this.wrap.querySelector('.head');
    clear(this.wrap);
    this.sections.clear();
    if (head) this.wrap.append(head);
    this.wrap.append(h('p', { class: 'muted pad' }, msg));
  }

  /* The whole heading is a button that opens the full panel at that view. */
  private sectionHead(tab: Tab, n: number | null): HTMLElement {
    const label = LABELS[tab];
    const b = h(
      'button',
      { class: 'sec-head', type: 'button', 'aria-label': `${label}${n ? `, ${n}` : ''}: open in the full view` },
      h('span', { class: 'label' }, label),
      n ? h('span', { class: tab === 'checkup' || tab === 'grade' ? 'pill red' : 'pill' }, n > 99 ? '99+' : String(n)) : null,
      h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')
    );
    b.addEventListener('click', () => this.open(tab));
    return b;
  }

  /* Fill whichever sections have data; leave the rest saying Loading. Keeps
     keyboard focus on the same section heading if it was there. */
  private render(s: CardSummary, scoped: boolean): void {
    const focused = this.root.activeElement?.closest('.sec')?.getAttribute('data-sec') as Tab | undefined;
    const now = this.now();
    if (s.grade !== undefined) this.fill('grade', s.grade ? s.grade.total : null, s.grade ? this.gradeBody(s.grade, !scoped, now) : this.failed());
    if (s.checkup !== undefined) this.fill('checkup', s.checkup ? s.checkup.fix : null, s.checkup ? this.checkupBody(s.checkup, !scoped) : this.failed());
    if (s.students !== undefined) this.fill('students', s.students ? s.students.n : null, s.students ? this.studentsBody(s.students) : this.failed());
    if (s.week !== undefined) this.fill('week', null, s.week ? this.weekStrip(s.week) : this.failed());
    if (focused) (this.sections.get(focused)?.querySelector('.sec-head') as HTMLElement | null)?.focus();
  }

  private fill(tab: Tab, n: number | null, body: HTMLElement): void {
    const sec = this.sections.get(tab);
    if (!sec) return;
    clear(sec);
    append(sec, this.sectionHead(tab, n), body);
  }

  private failed(): HTMLElement {
    return h('p', { class: 'muted' }, "Couldn't load. Refresh the page to try again.");
  }

  private gradeBody(g: GradeSummary, showCourse: boolean, now: Date): HTMLElement {
    const box = h('div');
    if (!g.rows.length) {
      box.append(h('p', { class: 'muted' }, 'Nothing waiting. Nice.'));
      return box;
    }
    const list = h('ul', { class: 'list' });
    for (const r of g.rows) {
      const href = canvasLink('/courses/:c/gradebook/speed_grader?assignment_id=:a', { c: r.courseId, a: r.assignmentId });
      list.append(
        h(
          'li',
          {},
          h('a', { href }, r.name),
          h('span', { class: 'small' }, `${showCourse ? `${r.code} · ` : ''}${r.count} to grade${r.oldest ? ` · waiting ${waitingFor(new Date(r.oldest), now)}` : ''}`)
        )
      );
    }
    box.append(list);
    if (g.assignments > g.rows.length) {
      const more = h('button', { class: 'more', type: 'button' }, `${plural(g.assignments - g.rows.length, 'more assignment')} (${plural(g.total, 'submission')} in all)`);
      more.addEventListener('click', () => this.open('grade'));
      box.append(more);
    }
    return box;
  }

  private checkupBody(c: CheckupSummary, showCourse: boolean): HTMLElement {
    const body = h('div');
    if (!c.fix && !c.check) {
      body.append(h('p', { class: 'muted' }, 'No setup problems found.'));
      return body;
    }
    body.append(h('p', { class: 'line' }, [c.fix ? `${c.fix} to fix` : '', c.check ? `${c.check} worth a look` : ''].filter(Boolean).join(' · ')));
    for (const i of c.top) body.append(h('p', { class: 'small' }, showCourse ? `${i.code}: ` : '', i.title));
    return body;
  }

  private studentsBody(st: StudentsSummary): HTMLElement {
    const t = this.opts.settings.missingThreshold;
    const when = st.periodKnown ? 'this grading period' : 'so far';
    return h(
      'p',
      { class: st.n ? 'line' : 'muted' },
      st.n ? `${plural(st.n, 'student')} with ${t}+ missing ${when}` : `No students with ${t}+ missing ${when}.`
    );
  }

  private weekStrip(w: WeekSummary): HTMLElement {
    const box = h('div');
    const strip = h('ol', { class: 'strip', 'aria-label': 'Items due each of the next 7 days' });
    w.days.forEach((d, i) => {
      const date = new Date(d.at);
      const name = i === 0 ? 'Today' : DAY_NAME.format(date);
      strip.append(
        h(
          'li',
          {
            class: d.flagged ? 'flag' : d.n ? 'some' : '',
            title: `${name}: ${plural(d.n, 'item')}${d.flagged ? ', 2+ graded items for one class' : ''}`,
          },
          h('span', { class: 'd', 'aria-hidden': 'true' }, i === 0 ? 'Today' : DAY_LETTER.format(date)),
          h('span', { class: 'n', 'aria-hidden': 'true' }, String(d.n)),
          h('span', { class: 'sr' }, `${name}, ${plural(d.n, 'item')}${d.flagged ? ', heavy day' : ''}`)
        )
      );
    });
    box.append(strip);
    const heavy = w.days.filter((d) => d.flagged).length;
    box.append(h('p', { class: 'small' }, `${plural(w.total, 'item')} due in the next 7 days${heavy ? ` · ${plural(heavy, 'heavy day')}` : ''}`));
    return box;
  }
}

/* Course home: Canvas keeps To Do under the teacher buttons, inside
   #course_show_secondary. Lift it out to just above them, so the order is
   this card, To Do, then the buttons. Canvas's own elements are moved, not
   copied, so its links and "ignore" buttons keep working. */
export function moveTodoUp(doc: Document): void {
  const box = doc.querySelector('#right-side > #course_show_secondary');
  const head = box?.querySelector(':scope > .todo-list-header');
  const list = box?.querySelector(':scope > .to-do-list');
  if (!box || !head || !list) return;
  box.parentElement!.insertBefore(head, box);
  box.parentElement!.insertBefore(list, box);
}

/* Where the card goes: the top of the right sidebar, above To Do on both the
   Dashboard and a course's home page.
   Canvas fills the Dashboard sidebar after the page loads, so the caller
   re-runs this when #right-side changes. */
export function cardSlot(doc: Document, kind: 'dashboard' | 'course'): { parent: Element; before: Node | null } | null {
  const side = doc.querySelector('#right-side');
  if (!side) return null;
  if (kind === 'course') {
    const todo = side.querySelector(':scope > .todo-list-header');
    if (todo) return { parent: side, before: todo };
    const buttons = side.querySelector(':scope > #course_show_secondary');
    if (buttons) return { parent: side, before: buttons };
  } else {
    const todo = side.querySelector(':scope > .todo-list-header');
    if (todo) return { parent: side, before: todo };
    const logo = side.querySelector(':scope > .ic-sidebar-logo');
    if (logo) return { parent: side, before: logo.nextSibling };
  }
  return { parent: side, before: side.firstChild };
}

/* Is the card where it belongs? */
export function inSlot(host: Element, slot: { parent: Element; before: Node | null }): boolean {
  return host.parentElement === slot.parent && (slot.before === host || host.nextSibling === slot.before);
}

export function isShown(el: Element): boolean {
  if (!el.isConnected) return false;
  const r = el.getBoundingClientRect();
  return el.getClientRects().length > 0 && r.width > 0 && r.height > 0;
}

/*
  The sidebar card: a compact summary of To grade, Check-up, Students and
  Week, placed in Canvas's own right sidebar on the Dashboard (all classes)
  and on a course's home page (that class only). Each section opens the full
  panel at that view. Lives in a closed shadow root like the panel, and uses
  the same in-memory Loader, so opening the panel downloads nothing twice.

  Student names never appear here: the sidebar is always on screen, so it
  only ever shows counts.
*/
import { canvasLink } from '../lib/canvasApi';
import { Settings, loadIgnored } from '../lib/settings';
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
const DAY_LETTER = new Intl.DateTimeFormat('en-US', { weekday: 'narrow' });
const DAY_NAME = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

export interface CardOptions {
  loader: Loader;
  settings: Settings;
  /* null on the Dashboard (all classes); a course id on that course's home page */
  courseId: string | null;
  onOpen: (tab: Tab) => void;
  onGradeCount?: (n: number) => void;
  now?: () => Date;
}

export class SidebarCard {
  readonly host: HTMLElement;
  private root: ShadowRoot;
  private wrap: HTMLElement;
  private sections = new Map<Tab, HTMLElement>();
  private token = 0;
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
  }

  updateSettings(s: Settings): void {
    this.opts.settings = s;
    void this.load();
  }

  async load(): Promise<void> {
    const token = ++this.token;
    const scoped = this.opts.courseId !== null;
    clear(this.wrap);
    this.sections.clear();

    const open = h('button', { class: 'open', type: 'button' }, 'Open');
    open.addEventListener('click', () => this.opts.onOpen('grade'));
    this.wrap.append(
      h(
        'div',
        { class: 'head' },
        h('span', { class: 'mark', 'aria-hidden': 'true' }, 'RJ'),
        h('h2', { id: 'rjtt-card-title' }, scoped ? 'This class' : 'My Classes'),
        open
      )
    );
    for (const [tab, label] of [
      ['grade', 'To grade'],
      ['checkup', 'Check-up'],
      ['students', 'Students'],
      ['week', 'Week'],
    ] as Array<[Tab, string]>) {
      const sec = h('div', { class: 'sec', 'data-sec': tab }, this.sectionHead(tab, label, null), h('p', { class: 'muted' }, 'Loading…'));
      this.sections.set(tab, sec);
      this.wrap.append(sec);
    }

    let courses: TeacherCourse[];
    try {
      const all = await this.opts.loader.courses(this.opts.settings.excludedCourses, this.opts.settings.allClasses);
      courses = scoped ? all.filter((c) => c.id === this.opts.courseId) : all;
    } catch {
      if (token !== this.token) return;
      this.replaceAll("Couldn't reach Canvas. Refresh the page to try again.");
      return;
    }
    if (token !== this.token) return;
    if (!courses.length) {
      this.replaceAll(
        scoped
          ? 'This class is turned off in RJ Tasks settings.'
          : 'No classes this semester. Classes you turned off in Settings are left out.'
      );
      return;
    }

    const L = this.opts.loader;
    const s = this.opts.settings;
    const now = this.now();
    void L.toGrade(courses)
      .then((r) => {
        if (token !== this.token) return;
        const total = r.value.reduce((n, x) => n + x.count, 0);
        this.opts.onGradeCount?.(total);
        this.fill('grade', total, this.gradeBody(r.value, total, !scoped, now));
      })
      .catch(() => this.fill('grade', null, this.failed()));
    void loadIgnored()
      .then((ignored) => L.checkup(courses, ignored))
      .then((r) => {
        if (token !== this.token) return;
        const fix = r.value.filter((i) => i.severity === 'fix');
        const check = r.value.length - fix.length;
        const body = h('div');
        if (!r.value.length) body.append(h('p', { class: 'muted' }, 'No setup problems found.'));
        else {
          body.append(
            h('p', { class: 'line' }, [fix.length ? `${fix.length} to fix` : '', check ? `${check} worth a look` : ''].filter(Boolean).join(' · '))
          );
          for (const i of fix.slice(0, 2))
            body.append(h('p', { class: 'small' }, !scoped ? `${i.course.code}: ` : '', i.title));
        }
        this.fill('checkup', fix.length, body);
      })
      .catch(() => this.fill('checkup', null, this.failed()));
    void L.students(courses, s.missingThreshold)
      .then((r) => {
        if (token !== this.token) return;
        const n = r.value.length;
        const when = r.periodKnown ? 'this grading period' : 'so far';
        const body = h(
          'p',
          { class: n ? 'line' : 'muted' },
          n
            ? `${plural(n, 'student')} with ${s.missingThreshold}+ missing ${when}`
            : `No students with ${s.missingThreshold}+ missing ${when}.`
        );
        this.fill('students', n, body);
      })
      .catch(() => this.fill('students', null, this.failed()));
    void L.week(courses)
      .then((r) => {
        if (token !== this.token) return;
        const total = r.value.reduce((n, d) => n + d.items.length, 0);
        this.fill('week', total, this.weekStrip(r.value, total));
      })
      .catch(() => this.fill('week', null, this.failed()));
  }

  /* The whole heading is a button that opens the full panel at that view. */
  private sectionHead(tab: Tab, label: string, n: number | null): HTMLElement {
    const b = h(
      'button',
      { class: 'sec-head', type: 'button', 'aria-label': `${label}${n ? `, ${n}` : ''}: open in the full view` },
      h('span', { class: 'label' }, label),
      n ? h('span', { class: tab === 'checkup' || tab === 'grade' ? 'pill red' : 'pill' }, n > 99 ? '99+' : String(n)) : null,
      h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')
    );
    b.addEventListener('click', () => this.opts.onOpen(tab));
    return b;
  }

  private fill(tab: Tab, n: number | null, body: HTMLElement): void {
    const sec = this.sections.get(tab);
    if (!sec) return;
    const label = { grade: 'To grade', checkup: 'Check-up', students: 'Students', week: 'Week' }[tab];
    clear(sec);
    append(sec, this.sectionHead(tab, label, tab === 'week' ? null : n), body);
  }

  private replaceAll(msg: string): void {
    const head = this.wrap.firstChild;
    clear(this.wrap);
    if (head) this.wrap.append(head);
    this.wrap.append(h('p', { class: 'muted pad' }, msg));
  }

  private failed(): HTMLElement {
    return h('p', { class: 'muted' }, "Couldn't load. Refresh the page to try again.");
  }

  private gradeBody(rows: GradingRow[], total: number, showCourse: boolean, now: Date): HTMLElement {
    const box = h('div');
    if (!rows.length) {
      box.append(h('p', { class: 'muted' }, 'Nothing waiting. Nice.'));
      return box;
    }
    const list = h('ul', { class: 'list' });
    for (const r of rows.slice(0, TOP_ROWS)) {
      const href = canvasLink('/courses/:c/gradebook/speed_grader?assignment_id=:a', { c: r.course.id, a: r.assignmentId });
      list.append(
        h(
          'li',
          {},
          showCourse ? h('span', { class: 'code' }, r.course.code) : null,
          h('a', { href }, r.name),
          h('span', { class: 'small' }, `${r.count} to grade${r.oldest ? ` · waiting ${waitingFor(r.oldest, now)}` : ''}`)
        )
      );
    }
    box.append(list);
    if (rows.length > TOP_ROWS) {
      const more = h('button', { class: 'more', type: 'button' }, `${plural(rows.length - TOP_ROWS, 'more assignment')} (${plural(total, 'submission')} in all)`);
      more.addEventListener('click', () => this.opts.onOpen('grade'));
      box.append(more);
    }
    return box;
  }

  private weekStrip(days: WeekDay[], total: number): HTMLElement {
    const box = h('div');
    const strip = h('ol', { class: 'strip', 'aria-label': 'Items due each of the next 7 days' });
    days.forEach((d, i) => {
      const name = i === 0 ? 'Today' : DAY_NAME.format(d.date);
      const flagged = d.flags.length > 0;
      strip.append(
        h(
          'li',
          {
            class: flagged ? 'flag' : d.items.length ? 'some' : '',
            title: `${name}: ${plural(d.items.length, 'item')}${flagged ? ', 2+ graded items for one class' : ''}`,
          },
          h('span', { class: 'd' }, i === 0 ? 'Today' : DAY_LETTER.format(d.date)),
          h('span', { class: 'n' }, String(d.items.length)),
          h('span', { class: 'sr' }, ` ${name}, ${plural(d.items.length, 'item')}${flagged ? ', heavy day' : ''}`)
        )
      );
    });
    box.append(strip);
    const heavy = days.filter((d) => d.flags.length).length;
    box.append(
      h('p', { class: 'small' }, `${plural(total, 'item')} due in the next 7 days${heavy ? ` · ${plural(heavy, 'heavy day')}` : ''}`)
    );
    return box;
  }
}

/* Where the card goes. Dashboard: top of the right sidebar, above To Do.
   Course home: under the teacher buttons (Import, Choose Home Page...). */
export function cardSlot(doc: Document, kind: 'dashboard' | 'course'): { parent: Element; before: Node | null } | null {
  const side = doc.querySelector('#right-side');
  if (!side) return null;
  if (kind === 'course') {
    const after = doc.querySelector('#course_show_secondary');
    if (after && after.parentElement === side) return { parent: side, before: after.nextSibling };
  } else {
    const todo = side.querySelector(':scope > .todo-list-header');
    if (todo) return { parent: side, before: todo };
    const logo = side.querySelector(':scope > .ic-sidebar-logo');
    if (logo) return { parent: side, before: logo.nextSibling };
  }
  return { parent: side, before: side.firstChild };
}

export function isShown(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return el.getClientRects().length > 0 && r.width > 0 && r.height > 0;
}

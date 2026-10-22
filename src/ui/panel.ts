/*
  The My Classes button and panel. Everything lives in a closed shadow root:
  Canvas's page scripts and styles can't reach inside it, and it can't
  restyle Canvas.
*/
import { PRODUCT_NAME } from '../lib/constants';
import { TeacherCourse } from '../lib/types';
import { Loader } from '../data/loader';
import { Issue } from '../data/checkup';
import { studentsAsText, StudentRow } from '../data/students';
import { Settings, loadIgnored, saveKnownCourses, saveSettings, setIgnored } from '../lib/settings';
import { formatDayTime } from '../lib/dates';
import { CSS } from './styles';
import { append, clear, h, plural } from './dom';
import { checkupView, failedNote, gradingView, studentsView, weekView } from './views';

/* 'closed' in the shipped build; the test build uses 'open' so Playwright can see inside. */
declare const SHADOW_MODE: 'open' | 'closed';

type Tab = 'grade' | 'checkup' | 'students' | 'week';
const TABS: Array<[Tab, string]> = [
  ['grade', 'To grade'],
  ['checkup', 'Check-up'],
  ['students', 'Students'],
  ['week', 'Week'],
];

export interface PanelOptions {
  settings: Settings;
  currentCourseId: string | null;
  showButton: boolean;
  openSettings: () => void;
  now?: () => Date;
}

export class Panel {
  readonly host: HTMLElement;
  private root: ShadowRoot;
  private wrap: HTMLElement;
  private launcher: HTMLButtonElement;
  private badge: HTMLElement;
  private panel: HTMLElement | null = null;
  private body!: HTMLElement;
  private status!: HTMLElement;
  private foot!: HTMLElement;
  private tabButtons = new Map<Tab, HTMLButtonElement>();
  private scope: string = 'all';
  private tab: Tab = 'grade';
  private namesShown = false;
  private loader: Loader;
  private courses: TeacherCourse[] = [];
  private lastStudents: StudentRow[] = [];
  private renderToken = 0;
  private now: () => Date;

  constructor(private opts: PanelOptions) {
    this.now = opts.now ?? (() => new Date());
    this.loader = new Loader(this.now);
    this.host = document.createElement('div');
    this.host.setAttribute('data-rjtt', '');
    this.root = this.host.attachShadow({ mode: SHADOW_MODE });
    this.applyStyles();
    this.wrap = h('div', { class: 'wrap' });
    this.root.appendChild(this.wrap);

    this.badge = h('span', { class: 'badge', hidden: true });
    this.launcher = h(
      'button',
      { class: 'launcher', type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' },
      'My Classes',
      this.badge
    ) as HTMLButtonElement;
    this.launcher.hidden = !opts.showButton;
    this.launcher.addEventListener('click', () => this.toggle());
    this.wrap.appendChild(this.launcher);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.panel && !this.panel.hidden) {
        e.stopPropagation();
        this.close();
      }
    }, true);
  }

  private applyStyles(): void {
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
      this.root.adoptedStyleSheets = [sheet];
    } catch {
      const style = document.createElement('style');
      style.textContent = CSS;
      this.root.appendChild(style);
    }
  }

  setBadge(n: number | null): void {
    if (n && n > 0) {
      this.badge.textContent = n > 99 ? '99+' : String(n);
      this.badge.hidden = false;
      this.launcher.setAttribute('aria-label', `My Classes, ${plural(n, 'assignment')} to grade`);
    } else {
      this.badge.hidden = true;
      this.launcher.setAttribute('aria-label', 'My Classes');
    }
  }

  updateSettings(s: Settings): void {
    this.opts.settings = s;
    if (!s.hideNames) this.namesShown = true;
    if (this.panel && !this.panel.hidden) {
      this.loader.reset();
      void this.openPanel();
    }
  }

  isOpen(): boolean {
    return !!this.panel && !this.panel.hidden;
  }

  toggle(): void {
    if (this.isOpen()) this.close();
    else void this.openPanel();
  }

  close(): void {
    if (!this.panel) return;
    this.panel.hidden = true;
    this.launcher.hidden = !this.opts.showButton;
    this.launcher.setAttribute('aria-expanded', 'false');
    this.namesShown = !this.opts.settings.hideNames; // re-hide names every time it closes
    this.launcher.focus();
  }

  async openPanel(): Promise<void> {
    if (!this.panel) this.build();
    this.panel!.hidden = false;
    this.launcher.hidden = true;
    this.launcher.setAttribute('aria-expanded', 'true');
    this.namesShown = this.namesShown || !this.opts.settings.hideNames;
    (this.panel!.querySelector('h2') as HTMLElement).focus();
    await this.loadCourses();
  }

  private build(): void {
    const close = h('button', { class: 'close', type: 'button', 'aria-label': 'Close' }, '✕');
    close.addEventListener('click', () => this.close());

    const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Views' });
    for (const [id, label] of TABS) {
      const b = h('button', { class: 'tab', type: 'button', role: 'tab', id: `rjtt-tab-${id}`, 'aria-selected': 'false', 'aria-controls': 'rjtt-body', 'data-tab': id }, label) as HTMLButtonElement;
      b.addEventListener('click', () => this.select(id));
      b.addEventListener('keydown', (e) => {
        const i = TABS.findIndex(([t]) => t === id);
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length][0];
          this.select(next);
          this.tabButtons.get(next)!.focus();
          e.preventDefault();
        }
      });
      this.tabButtons.set(id, b);
      tabs.append(b);
    }

    this.status = h('span', { role: 'status', 'aria-live': 'polite' });
    const refresh = h('button', { class: 'linkbtn', type: 'button' }, 'Refresh');
    refresh.addEventListener('click', () => {
      this.loader.reset();
      void this.loadCourses();
    });
    const settings = h('button', { class: 'linkbtn', type: 'button' }, 'Settings');
    settings.addEventListener('click', () => this.opts.openSettings());
    this.foot = h('div', { class: 'foot' }, this.status, h('span', { class: 'spacer' }), refresh, settings);

    this.body = h('div', { class: 'body', id: 'rjtt-body', role: 'tabpanel', tabindex: '-1' });

    this.panel = h(
      'section',
      { class: 'panel', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'rjtt-title' },
      h(
        'div',
        { class: 'mast' },
        h('div', { class: 'mark', 'aria-hidden': 'true' }, 'RJ'),
        h('div', {}, h('h2', { id: 'rjtt-title', tabindex: '-1' }, PRODUCT_NAME), h('p', { class: 'tag' }, 'Grading · Check-up · Students · Week')),
        close
      ),
      h('div', { class: 'scope' }, h('label', { for: 'rjtt-scope' }, 'Show'), h('select', { id: 'rjtt-scope' })),
      tabs,
      this.body,
      this.foot
    );
    this.panel.hidden = true;
    const sel = this.panel.querySelector('select') as HTMLSelectElement;
    sel.addEventListener('change', () => {
      this.scope = sel.value;
      this.renderTab();
    });
    this.wrap.appendChild(this.panel);
    this.select(this.tab, false);
  }

  private select(tab: Tab, render = true): void {
    this.tab = tab;
    for (const [id, b] of this.tabButtons) {
      b.setAttribute('aria-selected', String(id === tab));
      b.tabIndex = id === tab ? 0 : -1;
    }
    this.body.setAttribute('aria-labelledby', `rjtt-tab-${tab}`);
    if (render) this.renderTab();
  }

  private setStatus(text: string): void {
    this.status.textContent = text;
  }

  private async loadCourses(): Promise<void> {
    clear(this.body);
    this.body.append(h('p', { class: 'empty' }, 'Loading your classes…'));
    this.setStatus('Loading…');
    try {
      this.courses = await this.loader.courses(this.opts.settings.excludedCourses);
      void this.loader
        .courses([])
        .then((all) => saveKnownCourses(all))
        .catch(() => undefined);
    } catch {
      clear(this.body);
      this.body.append(h('p', { class: 'empty' }, "Couldn't reach Canvas. Check that you're signed in, then click Refresh."));
      this.setStatus('');
      return;
    }
    const sel = this.panel!.querySelector('select') as HTMLSelectElement;
    clear(sel);
    sel.append(h('option', { value: 'all' }, `All my classes (${this.courses.length})`));
    for (const c of this.courses) sel.append(h('option', { value: c.id }, c.code === c.name ? c.name : `${c.code} · ${c.name}`));
    const cur = this.opts.currentCourseId;
    if (this.scope === 'all' && cur && this.courses.some((c) => c.id === cur)) this.scope = cur;
    if (this.scope !== 'all' && !this.courses.some((c) => c.id === this.scope)) this.scope = 'all';
    sel.value = this.scope;
    this.renderTab();
  }

  private inScope(): TeacherCourse[] {
    return this.scope === 'all' ? this.courses : this.courses.filter((c) => c.id === this.scope);
  }

  private async renderTab(): Promise<void> {
    if (!this.panel) return;
    const token = ++this.renderToken;
    const courses = this.inScope();
    const showCourse = this.scope === 'all';
    clear(this.body);
    if (!this.courses.length) {
      this.body.append(
        h('p', { class: 'empty' }, "You aren't listed as the teacher of any current Canvas classes."),
        h('p', { class: 'note' }, 'If that seems wrong, check Settings for classes you turned off.')
      );
      this.setStatus('');
      return;
    }
    this.body.append(h('p', { class: 'empty' }, 'Loading…'));
    this.setStatus('Loading…');
    const now = this.now();
    let content: HTMLElement;
    let note: HTMLElement | null = null;
    try {
      if (this.tab === 'grade') {
        const r = await this.loader.toGrade(courses);
        content = gradingView(r.value, showCourse, now);
        note = failedNote(r.failed, r.partial);
        this.setCount('grade', r.value.reduce((s, x) => s + x.count, 0));
      } else if (this.tab === 'checkup') {
        const ignored = await loadIgnored();
        const r = await this.loader.checkup(courses, ignored);
        const ids = new Set(courses.map((c) => c.id));
        const ignoredHere = [...ignored].filter((k) => ids.has(k.split(':')[0])).length;
        content = checkupView(r.value, ignoredHere, showCourse, (i) => this.ignore(i), () => this.unignore(courses));
        note = failedNote(r.failed, r.partial);
        this.setCount('checkup', r.value.filter((i) => i.severity === 'fix').length);
      } else if (this.tab === 'students') {
        const r = await this.loader.students(courses, this.opts.settings.missingThreshold);
        this.lastStudents = r.value;
        content = studentsView({
          rows: r.value,
          courses,
          threshold: this.opts.settings.missingThreshold,
          namesShown: this.namesShown,
          showCourse,
          onShowNames: () => {
            this.namesShown = true;
            this.renderTab();
          },
          onHideNames: () => {
            this.namesShown = false;
            this.renderTab();
          },
          onCopy: () => this.copyStudents(),
          onThreshold: (n) => {
            this.opts.settings = { ...this.opts.settings, missingThreshold: n };
            void saveSettings(this.opts.settings).catch(() => undefined);
            this.renderTab();
          },
        });
        note = failedNote(r.failed, r.partial);
      } else {
        const r = await this.loader.week(courses);
        content = weekView(r.value, showCourse, now);
        note = failedNote(r.failed, r.partial);
      }
    } catch {
      content = h('p', { class: 'empty' }, "Couldn't load this from Canvas. Click Refresh to try again.");
    }
    if (token !== this.renderToken) return; // a newer render started
    clear(this.body);
    append(this.body, content, note);
    this.setStatus(`Updated ${formatDayTime(now).split(', ').pop()}`);
  }

  private setCount(tab: Tab, n: number): void {
    const b = this.tabButtons.get(tab);
    if (!b) return;
    const label = TABS.find(([t]) => t === tab)![1];
    clear(b);
    append(b, label, n ? h('span', { class: 'n' }, ` ${n}`) : null);
  }

  private async ignore(i: Issue): Promise<void> {
    const set = await loadIgnored();
    set.add(i.key);
    await setIgnored(set).catch(() => undefined);
    this.renderTab();
  }

  private async unignore(courses: TeacherCourse[]): Promise<void> {
    const ids = new Set(courses.map((c) => c.id));
    const set = await loadIgnored();
    for (const k of [...set]) if (ids.has(k.split(':')[0])) set.delete(k);
    await setIgnored(set).catch(() => undefined);
    this.renderTab();
  }

  private async copyStudents(): Promise<void> {
    try {
      await navigator.clipboard.writeText(studentsAsText(this.lastStudents));
      this.setStatus('List copied');
    } catch {
      this.setStatus("Couldn't copy. Select the names instead.");
    }
  }
}

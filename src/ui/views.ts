/* Renders each tab's content from already-loaded data. No network here. */
import { canvasLink } from '../lib/canvasApi';
import { PD_HELP } from '../lib/constants';
import { formatDay, formatDayTime, waitingFor, daysBetween } from '../lib/dates';
import { GradingRow } from '../data/grading';
import { Issue } from '../data/checkup';
import { StudentRow } from '../data/students';
import { ForecastDay, HEAVY_DAY, WeekDay } from '../data/week';
import { TeacherCourse } from '../lib/types';
import { h, plural } from './dom';

const OLD_DAYS = 7;

function codeChip(c: TeacherCourse, show: boolean): HTMLElement | null {
  return show ? h('span', { class: 'code' }, c.code) : null;
}

export function failedNote(failed: TeacherCourse[], partial: boolean): HTMLElement | null {
  const parts: string[] = [];
  if (failed.length)
    parts.push(`Couldn't load ${failed.map((c) => c.code).join(', ')}. Try Refresh, or open the class in Canvas.`);
  if (partial) parts.push('Some lists were very long, so a few items may be missing here.');
  return parts.length ? h('p', { class: 'note', role: 'status' }, parts.join(' ')) : null;
}

/* ---------------- To grade ---------------- */

export function gradingView(rows: GradingRow[], showCourse: boolean, now: Date): HTMLElement {
  const box = h('div');
  if (!rows.length) {
    box.append(h('p', { class: 'empty' }, 'Nothing is waiting to be graded.'));
    return box;
  }
  const total = rows.reduce((s, r) => s + r.count, 0);
  box.append(
    h('p', { class: 'summary' }, `${plural(total, 'submission')} to grade in ${plural(rows.length, 'assignment')}. Oldest first.`)
  );
  for (const r of rows) {
    const old = !!r.oldest && daysBetween(r.oldest, now) >= OLD_DAYS;
    const href = canvasLink('/courses/:c/gradebook/speed_grader?assignment_id=:a', {
      c: r.course.id,
      a: r.assignmentId,
    });
    const meta = h('span', { class: 'meta' }, h('b', {}, `${r.count} to grade`));
    if (r.late) meta.append(' · ', h('span', { class: 'late' }, `${r.late} late`));
    if (r.resubmitted) meta.append(` · ${r.resubmitted} resubmitted`);
    if (r.review) meta.append(` · ${r.review} quiz ${r.review === 1 ? 'answer' : 'answers'} to review`);
    if (r.oldest) meta.append(` · oldest waiting ${waitingFor(r.oldest, now)}`);
    box.append(
      h(
        'div',
        { class: old ? 'row old' : 'row' },
        codeChip(r.course, showCourse),
        h('a', { class: 'title', href }, r.name),
        meta,
        h('div', { class: 'actions' }, h('a', { class: 'btn primary', href }, 'Open SpeedGrader'))
      )
    );
  }
  return box;
}

/* ---------------- Check-up ---------------- */

export function issueHref(i: Issue): string {
  switch (i.link.kind) {
    case 'assignment_edit':
      return canvasLink('/courses/:c/assignments/:a/edit', { c: i.course.id, a: i.link.assignmentId });
    case 'modules':
      return canvasLink('/courses/:c/modules', { c: i.course.id });
    case 'gradebook':
      return canvasLink('/courses/:c/gradebook', { c: i.course.id });
    default:
      return canvasLink('/courses/:c/assignments', { c: i.course.id });
  }
}

const LINK_LABEL = { assignment_edit: 'Edit assignment', modules: 'Open Modules', gradebook: 'Open Gradebook', assignments_index: 'Open assignments' } as const;

export function checkupView(
  issues: Issue[],
  ignoredHere: number,
  showCourse: boolean,
  onIgnore: (i: Issue) => void,
  onUnignore: () => void
): HTMLElement {
  const box = h('div');
  const fix = issues.filter((i) => i.severity === 'fix');
  const check = issues.filter((i) => i.severity === 'check');
  if (!issues.length) {
    box.append(h('p', { class: 'empty' }, 'No setup problems found.'));
  } else {
    const bits: string[] = [];
    if (fix.length) bits.push(`${fix.length} to fix`);
    if (check.length) bits.push(`${check.length} worth a look`);
    box.append(h('p', { class: 'summary' }, bits.join(', ') + '.'));
  }
  const section = (title: string, list: Issue[]) => {
    if (!list.length) return;
    box.append(h('h3', {}, title));
    for (const i of list) {
      const ignore = h('button', { class: 'btn', type: 'button' }, 'Ignore');
      ignore.addEventListener('click', () => onIgnore(i));
      box.append(
        h(
          'div',
          { class: `row ${i.severity}`, 'data-rule': i.rule },
          codeChip(i.course, showCourse),
          h('span', { class: 'title plain' }, i.title),
          h('span', { class: 'meta' }, i.detail),
          h(
            'div',
            { class: 'actions' },
            h('a', { class: 'btn primary', href: issueHref(i) }, LINK_LABEL[i.link.kind]),
            PD_HELP[i.rule] ? h('a', { class: 'btn', href: canvasLink(PD_HELP[i.rule], {}), target: '_blank', rel: 'noopener' }, 'How to (PD)') : null,
            ignore
          )
        )
      );
    }
  };
  section('To fix', fix);
  section('Worth a look', check);
  if (ignoredHere) {
    const again = h('button', { class: 'linkbtn', type: 'button' }, 'Show them again');
    again.addEventListener('click', onUnignore);
    box.append(h('p', { class: 'note' }, `${plural(ignoredHere, 'item')} ignored. `, again));
  }
  box.append(
    h(
      'p',
      { class: 'note' },
      'Checks the RJ Baseline (everything in Modules, missing policy on, a graded item every week, grading kept current) plus setup slips: missing or out-of-semester due dates, unpublished work that is due, open/lock dates, rubric and point mismatches, group weights, duplicate names, weekend and 12:00 AM due times.'
    )
  );
  return box;
}

/* ---------------- Students ---------------- */

export function studentsView(opts: {
  rows: StudentRow[];
  courses: TeacherCourse[];
  threshold: number;
  periodKnown: boolean;
  namesShown: boolean;
  showCourse: boolean;
  onShowNames: () => void;
  onHideNames: () => void;
  onCopy: () => void;
  onThreshold: (n: number) => void;
}): HTMLElement {
  const { rows, threshold, namesShown, showCourse } = opts;
  const box = h('div');

  const sel = h('select', { 'aria-label': 'Minimum missing assignments' }) as HTMLSelectElement;
  for (const n of [1, 2, 3, 4, 5]) sel.append(h('option', { value: n, selected: n === threshold }, String(n)));
  sel.addEventListener('change', () => opts.onThreshold(Number(sel.value)));
  box.append(
    h('p', { class: 'summary' }, 'Students with at least ', sel, opts.periodKnown ? ' missing this grading period.' : ' missing so far this course.')
  );

  if (!rows.length) {
    box.append(h('p', { class: 'empty' }, 'No students at that level. Nice.'));
    return box;
  }

  if (!namesShown) {
    const show = h('button', { class: 'btn primary', type: 'button' }, 'Show names');
    show.addEventListener('click', opts.onShowNames);
    box.append(h('div', { class: 'privacy' }, h('span', {}, 'Names are hidden in case your screen is shared.'), show));
    const byCourse = new Map<string, { course: TeacherCourse; n: number }>();
    for (const r of rows) {
      const e = byCourse.get(r.course.id) ?? { course: r.course, n: 0 };
      e.n++;
      byCourse.set(r.course.id, e);
    }
    for (const { course, n } of byCourse.values())
      box.append(h('div', { class: 'count' }, h('span', {}, course.code), h('b', {}, plural(n, 'student'))));
    return box;
  }

  const hide = h('button', { class: 'btn', type: 'button' }, 'Hide names');
  hide.addEventListener('click', opts.onHideNames);
  const copy = h('button', { class: 'btn', type: 'button' }, 'Copy list');
  copy.addEventListener('click', opts.onCopy);
  box.append(h('div', { class: 'actions' }, hide, copy));

  let course = '';
  for (const r of rows) {
    if (showCourse && r.course.id !== course) {
      course = r.course.id;
      box.append(h('h3', {}, r.course.code));
    }
    const list = h('ul');
    for (const m of r.missing)
      list.append(h('li', {}, m.name, m.dueAt ? h('span', { class: 'meta' }, `Due ${formatDay(m.dueAt)}`) : null));
    box.append(
      h(
        'details',
        { class: 'row' },
        h('summary', {}, h('span', { class: 'plain' }, r.name), h('span', { class: 'meta' }, `${r.missing.length} missing`)),
        list,
        h(
          'div',
          { class: 'actions' },
          h('a', { class: 'btn', href: canvasLink('/courses/:c/grades/:u', { c: r.course.id, u: r.userId }) }, 'Open grades')
        )
      )
    );
  }
  box.append(h('p', { class: 'note' }, "Uses Canvas's Missing flag, so excused work and your own missing/late marks are respected."));
  return box;
}

/* ---------------- Your week ---------------- */

const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

export function weekView(days: WeekDay[], showCourse: boolean, now: Date): HTMLElement {
  const box = h('div');
  const total = days.reduce((s, d) => s + d.items.length, 0);
  const flagged = days.filter((d) => d.flags.length).length;
  box.append(
    h(
      'p',
      { class: 'summary' },
      `${plural(total, 'assignment')} due from your classes in the next 7 days.` +
        (flagged ? ` ${plural(flagged, 'day')} with ${HEAVY_DAY} or more graded assignments for the same class.` : '')
    )
  );
  days.forEach((d, idx) => {
    const label = idx === 0 ? 'Today' : idx === 1 ? 'Tomorrow' : d.date.toLocaleDateString('en-US', { weekday: 'long' });
    const day = h(
      'div',
      { class: 'day' },
      h('h4', {}, label, ' ', h('span', { class: 'muted' }, `${formatDay(d.date)} · ${plural(d.items.length, 'assignment')}`))
    );
    for (const f of d.flags)
      day.append(
        h(
          'div',
          { class: 'flag' },
          `${f.forWhom ?? f.course.code}: ${f.count} graded assignments due this day`
        )
      );
    for (const it of d.items)
      day.append(
        h(
          'div',
          { class: 'item' },
          h('span', { class: 'time' }, timeFmt.format(it.dueAt)),
          h(
            'span',
            {},
            showCourse ? h('span', { class: 'code' }, it.course.code) : null,
            h('a', { href: canvasLink('/courses/:c/assignments/:a', { c: it.course.id, a: it.assignmentId }) }, it.name),
            it.forWhom ? h('span', { class: 'meta' }, it.forWhom) : null
          ),
          it.points != null && it.points > 0 ? h('span', { class: 'pts' }, `${it.points} pts`) : null
        )
      );
    box.append(day);
  });
  box.append(
    h(
      'p',
      { class: 'note' },
      `Shows your classes only. Canvas doesn't let teachers see what students have due in other classes. Updated ${formatDayTime(now)}.`
    )
  );
  return box;
}

/* ---------------- Grading coming in (Week tab) ---------------- */

const SHORT_DAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const LETTER = new Intl.DateTimeFormat('en-US', { weekday: 'narrow' });

export function forecastView(days: ForecastDay[], courses: TeacherCourse[], waitingNow: number | null): HTMLElement {
  const box = h('section', { class: 'fc', 'aria-labelledby': 'rjtt-fc-title' });
  box.append(h('h3', { id: 'rjtt-fc-title' }, 'Grading coming in · next 2 weeks'));
  const total = days.reduce((s, d) => s + d.total, 0);
  const max = Math.max(1, ...days.map((d) => d.total));
  const busiest = days.reduce((b, d) => (d.total > b.total ? d : b), days[0]);
  const bits = [total ? `About ${plural(total, 'submission')} due from students in the next 14 days.` : 'Nothing that needs your grading is due in the next 14 days.'];
  if (total) bits.push(`Busiest: ${SHORT_DAY.format(busiest.date)} (about ${busiest.total}).`);
  if (waitingNow !== null) bits.push(`Waiting now: ${waitingNow}.`);
  box.append(h('p', { class: 'summary' }, bits.join(' ')));

  const color = new Map(courses.map((c, i) => [c.id, i % 6]));
  const bars = h('ol', { class: 'bars', 'aria-label': 'Submissions due each day' });
  days.forEach((d, i) => {
    const wd = d.date.getDay();
    const parts = d.byCourse.map((r) => `${r.course.code} ${r.n}`).join(', ');
    const col = h(
      'li',
      { class: `col${wd === 0 || wd === 6 ? ' wknd' : ''}${wd === 1 && i > 0 ? ' mon' : ''}`, title: `${SHORT_DAY.format(d.date)}: about ${d.total}${parts ? ` (${parts})` : ''}` },
      h('span', { class: 'tot', 'aria-hidden': 'true' }, d.total ? String(d.total) : '')
    );
    const stack = h('div', { class: 'stack', 'aria-hidden': 'true' });
    stack.style.height = `${Math.round((d.total / max) * 100)}%`;
    for (const r of d.byCourse) {
      const seg = h('span', { class: `seg c${color.get(r.course.id) ?? 0}` });
      seg.style.flexGrow = String(r.n);
      stack.append(seg);
    }
    col.append(
      h('div', { class: 'well' }, stack),
      h('span', { class: 'dl', 'aria-hidden': 'true' }, i === 0 ? 'Today' : LETTER.format(d.date)),
      h('span', { class: 'sr' }, `${i === 0 ? 'Today' : SHORT_DAY.format(d.date)}: about ${plural(d.total, 'submission')}${parts ? `: ${parts}` : ''}`)
    );
    bars.append(col);
  });
  box.append(bars);
  const shown = courses.filter((c) => days.some((d) => d.byCourse.some((r) => r.course.id === c.id)));
  if (shown.length > 1) {
    const legend = h('p', { class: 'legend' });
    for (const c of shown) legend.append(h('span', {}, h('span', { class: `chip c${color.get(c.id) ?? 0}`, 'aria-hidden': 'true' }), c.code));
    box.append(legend);
  }
  box.append(
    h('p', { class: 'note' }, "Estimated from due dates and class size. Leaves out quizzes Canvas grades for you and one-student extensions. Week starts are marked; weekends are shaded.")
  );
  return box;
}

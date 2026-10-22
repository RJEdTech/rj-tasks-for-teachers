/* Renders each tab's content from already-loaded data. No network here. */
import { canvasLink } from '../lib/canvasApi';
import { formatDay, formatDayTime, waitingFor, daysBetween } from '../lib/dates';
import { GradingRow } from '../data/grading';
import { Issue } from '../data/checkup';
import { StudentRow } from '../data/students';
import { WeekDay } from '../data/week';
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
  return i.link.kind === 'assignment_edit'
    ? canvasLink('/courses/:c/assignments/:a/edit', { c: i.course.id, a: i.link.assignmentId })
    : canvasLink('/courses/:c/assignments', { c: i.course.id });
}

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
          h('div', { class: 'actions' }, h('a', { class: 'btn primary', href: issueHref(i) }, i.link.kind === 'assignment_edit' ? 'Edit assignment' : 'Open assignments'), ignore)
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
      'Checks: missing due dates, unpublished work that is due, lock dates before due dates, 0-point assignments, 12:00 AM due times, and group weights.'
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
      `${plural(total, 'item')} due from your classes in the next 7 days.` +
        (flagged ? ` ${plural(flagged, 'day')} with 2 or more graded items for the same class.` : '')
    )
  );
  days.forEach((d, idx) => {
    const label = idx === 0 ? 'Today' : idx === 1 ? 'Tomorrow' : d.date.toLocaleDateString('en-US', { weekday: 'long' });
    const day = h(
      'div',
      { class: 'day' },
      h('h4', {}, label, ' ', h('span', { class: 'muted' }, `${formatDay(d.date)} · ${plural(d.items.length, 'item')}`))
    );
    for (const f of d.flags)
      day.append(
        h(
          'div',
          { class: 'flag' },
          `${f.course.code}${f.forWhom ? ` · ${f.forWhom}` : ''}: ${f.count} graded items due this day`
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

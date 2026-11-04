/*
  Course check-up: setup problems that confuse students or skew grades.
  Each rule is narrow on purpose: a check-up that cries wolf gets ignored.

  "fix"   — almost certainly a mistake (no due date, locks before due, ...)
  "check" — often intended, worth a look (0 points, midnight due time, ...)
*/
import { CanvasAssignment, CanvasAssignmentGroup, CanvasModule, TeacherCourse } from '../lib/types';
import { addDays, dayKey, formatDay, formatDayTime, isLocalMidnight, parse, startOfDay } from '../lib/dates';
import { datesOf, dueDates, isGraded } from './assignments';
import { whoFor } from './week';

export type Severity = 'fix' | 'check';
export type Rule =
  | 'no_due_date'
  | 'unpublished_due'
  | 'locks_before_due'
  | 'zero_points'
  | 'midnight_due'
  | 'weights_total'
  | 'zero_weight_group'
  | 'outside_term'
  | 'opens_after_due'
  | 'weekend_due'
  | 'rubric_points'
  | 'weights_off'
  | 'points_typo'
  | 'omitted'
  | 'duplicate_name'
  | 'not_in_module'
  | 'missing_policy'
  | 'weekly_graded'
  | 'grading_waiting';

/* Every check, for the settings page (each can be turned off). */
export const RULE_INFO: Array<{ rule: Rule; label: string; group: 'baseline' | 'fix' | 'check' }> = [
  { rule: 'not_in_module', label: 'Every assignment in a module (RJ Baseline 1)', group: 'baseline' },
  { rule: 'missing_policy', label: 'Missing policy on (RJ Baseline 2)', group: 'baseline' },
  { rule: 'weekly_graded', label: 'A graded item every week (RJ Baseline 3)', group: 'baseline' },
  { rule: 'grading_waiting', label: 'Grading waiting 7+ days (RJ Baseline 3)', group: 'baseline' },
  { rule: 'no_due_date', label: 'No due date', group: 'fix' },
  { rule: 'unpublished_due', label: 'Unpublished but due', group: 'fix' },
  { rule: 'locks_before_due', label: 'Locks before it is due', group: 'fix' },
  { rule: 'opens_after_due', label: 'Opens after it is due', group: 'fix' },
  { rule: 'outside_term', label: 'Due date outside this semester', group: 'fix' },
  { rule: 'rubric_points', label: "Rubric total doesn't match the points", group: 'fix' },
  { rule: 'weights_total', label: "Group weights don't add up to 100%", group: 'fix' },
  { rule: 'weights_off', label: 'Group weights set but turned off', group: 'fix' },
  { rule: 'zero_points', label: 'Worth 0 points', group: 'check' },
  { rule: 'midnight_due', label: 'Due at 12:00 AM', group: 'check' },
  { rule: 'weekend_due', label: 'Due on a weekend', group: 'check' },
  { rule: 'zero_weight_group', label: 'Graded work in a 0% group', group: 'check' },
  { rule: 'points_typo', label: 'Points far above the rest of its group', group: 'check' },
  { rule: 'omitted', label: "Set not to count toward the final grade", group: 'check' },
  { rule: 'duplicate_name', label: 'Two assignments with the same name', group: 'check' },
];
export const ALL_RULES: Rule[] = RULE_INFO.map((r) => r.rule);

/* Extra course facts some rules need. null/undefined = couldn't read it, so
   that rule is skipped rather than guessed. */
export interface CheckupExtra {
  modules?: CanvasModule[] | null;
  missingPolicyOn?: boolean | null;
  waiting7?: number | null;
}

export type IssueLink =
  | { kind: 'assignment_edit'; assignmentId: string }
  | { kind: 'assignments_index' }
  | { kind: 'modules' }
  | { kind: 'gradebook' };

export interface Issue {
  key: string; // stable id used for "Ignore"
  course: TeacherCourse;
  rule: Rule;
  severity: Severity;
  title: string; // assignment or group name
  detail: string;
  link: IssueLink;
  sortDate: number;
  /* RJ Baseline item this rule checks, if any (shown in the detail) */
  baseline?: number;
}

const WEIGHT_TOLERANCE = 0.05; // three groups at 33.33% must not trip it

/* Canvas's attendance tool (Roll Call) creates an undated assignment in every course. */
const ATTENDANCE = /^roll call attendance$/i;

function issueKey(courseId: string, rule: Rule, id: string): string {
  return `${courseId}:${rule}:${id}`;
}

export function runCheckup(
  course: TeacherCourse,
  assignments: CanvasAssignment[],
  groups: CanvasAssignmentGroup[],
  now: Date,
  extra: CheckupExtra = {}
): Issue[] {
  const out: Issue[] = [];
  const soon = addDays(now, 3).getTime();
  const recent = addDays(now, -14).getTime();
  const horizon = addDays(now, 21).getTime();

  const add = (
    rule: Rule,
    severity: Severity,
    a: CanvasAssignment,
    detail: string,
    sortDate = Number.MAX_SAFE_INTEGER
  ) =>
    out.push({
      key: issueKey(course.id, rule, String(a.id)),
      course,
      rule,
      severity,
      title: a.name,
      detail,
      link: { kind: 'assignment_edit', assignmentId: String(a.id) },
      sortDate,
    });

  for (const a of assignments) {
    const dates = datesOf(a);
    const due = dueDates(a);
    const graded = isGraded(a);

    if (a.published && graded && due.length === 0 && !ATTENDANCE.test(a.name.trim())) {
      add('no_due_date', 'fix', a, "No due date, so it won't appear in students' To Do list, calendar or RJ Tasks.");
    }

    if (!a.published) {
      const close = due
        .filter((d) => d.getTime() <= soon && d.getTime() >= recent)
        .sort((x, y) => x.getTime() - y.getTime())[0];
      if (close) {
        const past = close.getTime() < now.getTime();
        add(
          'unpublished_due',
          'fix',
          a,
          past
            ? `Not published, and it was due ${formatDayTime(close)}. Students can't see or submit it.`
            : `Not published, but it's due ${formatDayTime(close)}. Students can't see it yet.`,
          close.getTime()
        );
      }
    }

    for (const d of dates) {
      const dueAt = parse(d.due_at);
      const lockAt = parse(d.lock_at ?? null);
      if (dueAt && lockAt && lockAt.getTime() < dueAt.getTime() && a.published) {
        const who = !d.base && d.title ? ` for ${d.title}` : '';
        add(
          'locks_before_due',
          'fix',
          a,
          `Locks ${formatDayTime(lockAt)}${who}, before it's due ${formatDayTime(dueAt)}. Students can't submit on time.`,
          dueAt.getTime()
        );
        break;
      }
    }

    if (
      a.published &&
      graded &&
      (a.grading_type === 'points' || a.grading_type === 'percent') &&
      !((a.points_possible ?? 0) > 0)
    ) {
      add('zero_points', 'check', a, "Worth 0 points, so it won't change anyone's grade.");
    }

    if (a.published) {
      const midnight = due
        .filter((d) => d.getTime() > now.getTime() && d.getTime() <= horizon && isLocalMidnight(d))
        .sort((x, y) => x.getTime() - y.getTime())[0];
      if (midnight) {
        const nightBefore = addDays(midnight, -1);
        add(
          'midnight_due',
          'check',
          a,
          `Due at 12:00 AM on ${formatDay(midnight)}, which is the end of ${weekday(nightBefore)}. ` +
            `Students often read it as ${weekday(midnight)} night. If you meant ${weekday(nightBefore)} night, 11:59 PM is clearer.`,
          midnight.getTime()
        );
      }
    }

    perAssignmentExtras(course, a, now, add);
  }

  courseLevelExtras(course, assignments, groups, now, extra, out);

  if (course.weighted && groups.length) {
    const total = groups.reduce((s, g) => s + (g.group_weight ?? 0), 0);
    if (Math.abs(total - 100) > WEIGHT_TOLERANCE) {
      out.push({
        key: issueKey(course.id, 'weights_total', 'course'),
        course,
        rule: 'weights_total',
        severity: 'fix',
        title: 'Assignment group weights',
        detail:
          total < 100
            ? `The weights add up to ${round(total)}%, not 100%. Canvas scales them up, so each group counts for more than its weight says.`
            : `The weights add up to ${round(total)}%, more than 100%. Canvas doesn't scale them down, so class grades can come out higher than they should.`,
        link: { kind: 'assignments_index' },
        sortDate: 0,
      });
    }
    for (const g of groups) {
      if ((g.group_weight ?? 0) !== 0) continue;
      const counted = assignments.filter(
        (a) => String(a.assignment_group_id) === String(g.id) && a.published && isGraded(a) && (a.points_possible ?? 0) > 0
      );
      if (!counted.length) continue;
      out.push({
        key: issueKey(course.id, 'zero_weight_group', String(g.id)),
        course,
        rule: 'zero_weight_group',
        severity: 'check',
        title: g.name,
        detail: `This group is weighted 0%, so its ${counted.length} graded assignment${
          counted.length === 1 ? '' : 's'
        } don't count toward the class grade.`,
        link: { kind: 'assignments_index' },
        sortDate: 1,
      });
    }
  }
  return out;
}

export function sortIssues(issues: Issue[]): Issue[] {
  const sev = (s: Severity) => (s === 'fix' ? 0 : 1);
  return [...issues].sort(
    (a, b) =>
      sev(a.severity) - sev(b.severity) ||
      a.sortDate - b.sortDate ||
      a.course.code.localeCompare(b.course.code, 'en', { numeric: true }) ||
      a.title.localeCompare(b.title)
  );
}

function weekday(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long' });
}

function round(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, '');
}

/* ---------------- added in 1.1 ---------------- */

type AddFn = (rule: Rule, severity: Severity, a: CanvasAssignment, detail: string, sortDate?: number) => void;

const DAY = 86400000;
const SHORT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function perAssignmentExtras(course: TeacherCourse, a: CanvasAssignment, now: Date, add: AddFn): void {
  if (!a.published || ATTENDANCE.test(a.name.trim())) return;
  const dates = datesOf(a);
  const graded = isGraded(a);
  const pts = a.points_possible ?? 0;

  // Due outside this semester: usually a date left over from copying last year's course.
  if (course.termStart && course.termEnd) {
    const out = dueDates(a)
      .filter((d) => d.getTime() < course.termStart! - DAY || d.getTime() > course.termEnd! + DAY)
      .sort((x, y) => x.getTime() - y.getTime())[0];
    if (out)
      add(
        'outside_term',
        'fix',
        a,
        `Due ${SHORT.format(out)}, outside this semester (${SHORT.format(new Date(course.termStart))} – ${SHORT.format(new Date(course.termEnd))}). Often a date left over from copying a course.`,
        out.getTime()
      );
  }

  // Opens after it's due.
  for (const d of dates) {
    const due = parse(d.due_at);
    const opens = parse(d.unlock_at ?? null);
    if (due && opens && opens.getTime() > due.getTime()) {
      const who = !d.base && d.title ? ` for ${d.title}` : '';
      add('opens_after_due', 'fix', a, `Opens ${formatDayTime(opens)}${who}, after it's due ${formatDayTime(due)}. Students can't see it until it's already late.`, due.getTime());
      break;
    }
  }

  // Due on a weekend (next 3 weeks; a 12:00 AM time counts as the night before).
  if (graded) {
    const horizon = addDays(now, 21).getTime();
    for (const d of dates) {
      const due = parse(d.due_at);
      if (!due || due.getTime() <= now.getTime() || due.getTime() > horizon) continue;
      if (whoFor(d).scope === 'some') continue; // one student's extension
      const night = isLocalMidnight(due) ? addDays(due, -1) : due;
      const wd = night.getDay();
      if (wd === 0 || wd === 6) {
        add('weekend_due', 'check', a, `Due ${formatDayTime(due)}, which falls on a ${night.toLocaleDateString('en-US', { weekday: 'long' })}.`, due.getTime());
        break;
      }
    }
  }

  // Rubric total doesn't match the assignment's points.
  const rubric = a.rubric_settings?.points_possible;
  if (graded && typeof rubric === 'number' && rubric > 0 && pts > 0 && Math.abs(rubric - pts) > 0.001) {
    add(
      'rubric_points',
      a.use_rubric_for_grading ? 'fix' : 'check',
      a,
      a.use_rubric_for_grading
        ? `The rubric adds up to ${num(rubric)} points but the assignment is worth ${num(pts)}, and the rubric is used for grading, so scores come out wrong.`
        : `The rubric adds up to ${num(rubric)} points but the assignment is worth ${num(pts)}.`
    );
  }

  // Graded, worth points, but "Do not count this assignment towards the final grade" is on.
  if (a.omit_from_final_grade && a.grading_type !== 'not_graded' && pts > 0) {
    add('omitted', 'check', a, `Worth ${num(pts)} points, but "Do not count this assignment towards the final grade" is checked, so it never changes anyone's grade.`);
  }
}

function courseLevelExtras(
  course: TeacherCourse,
  assignments: CanvasAssignment[],
  groups: CanvasAssignmentGroup[],
  now: Date,
  extra: CheckupExtra,
  out: Issue[]
): void {
  const push = (rule: Rule, severity: Severity, id: string, title: string, detail: string, link: IssueLink, sortDate: number, baseline?: number) =>
    out.push({ key: issueKey(course.id, rule, id), course, rule, severity, title, detail, link, sortDate, baseline });
  const published = assignments.filter((a) => a.published && !ATTENDANCE.test(a.name.trim()));
  const counts = (a: CanvasAssignment) => isGraded(a) && (a.points_possible ?? 0) > 0;

  // Weights set on the groups, but the course isn't using them.
  if (!course.weighted && groups.length > 1) {
    const weights = groups.map((g) => g.group_weight ?? 0);
    const total = weights.reduce((x, y) => x + y, 0);
    if (total > 0) {
      const sum100 = Math.abs(total - 100) <= WEIGHT_TOLERANCE;
      push(
        'weights_off',
        sum100 ? 'fix' : 'check',
        'course',
        'Assignment group weights',
        `Your groups have weights (${groups.filter((g) => (g.group_weight ?? 0) > 0).map((g) => `${g.name} ${round(g.group_weight ?? 0)}%`).slice(0, 4).join(', ')}), but "Weight final grade based on assignment groups" is off, so Canvas ignores them and grades by total points.`,
        { kind: 'assignments_index' },
        0
      );
    }
  }

  // Points typo: far more than the rest of its group.
  for (const g of groups) {
    const inGroup = published.filter((a) => String(a.assignment_group_id) === String(g.id) && counts(a));
    if (inGroup.length < 4) continue;
    const sorted = inGroup.map((a) => a.points_possible ?? 0).sort((x, y) => x - y);
    const median = sorted[Math.floor(sorted.length / 2)];
    for (const a of inGroup) {
      const p = a.points_possible ?? 0;
      if (median > 0 && p >= 5 * median && p >= 50)
        out.push({
          key: issueKey(course.id, 'points_typo', String(a.id)),
          course,
          rule: 'points_typo',
          severity: 'check',
          title: a.name,
          detail: `Worth ${num(p)} points; most of ${g.name} is about ${num(median)}. Worth checking for a typo.`,
          link: { kind: 'assignment_edit', assignmentId: String(a.id) },
          sortDate: Number.MAX_SAFE_INTEGER,
        });
    }
  }

  // Two published assignments with the same name.
  const byName = new Map<string, CanvasAssignment[]>();
  for (const a of published) {
    const k = a.name.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!k) continue;
    byName.set(k, [...(byName.get(k) ?? []), a]);
  }
  for (const list of byName.values()) {
    if (list.length < 2) continue;
    const first = [...list].sort((x, y) => Number(x.id) - Number(y.id))[0];
    push(
      'duplicate_name',
      'check',
      String(first.id),
      first.name,
      `${list.length} published assignments are called this. Students can submit to the wrong one.`,
      { kind: 'assignments_index' },
      Number.MAX_SAFE_INTEGER
    );
  }

  // RJ Baseline 1: every published assignment reachable from Modules.
  if (Array.isArray(extra.modules)) {
    const reach = reachableFromModules(extra.modules);
    const missing = published.filter(
      (a) =>
        !reach.assignments.has(String(a.id)) &&
        !(a.quiz_id && reach.quizzes.has(String(a.quiz_id))) &&
        !(a.discussion_topic?.id && reach.discussions.has(String(a.discussion_topic.id)))
    );
    if (missing.length) {
      const names = missing.slice(0, 3).map((a) => a.name).join('; ');
      push(
        'not_in_module',
        'fix',
        'course',
        missing.length === 1 ? '1 assignment not in Modules' : `${missing.length} assignments not in Modules`,
        `${names}${missing.length > 3 ? `; and ${missing.length - 3} more` : ''}. Students can't reach ${missing.length === 1 ? 'it' : 'them'} from Modules. RJ Baseline 1: every assignment in a module.`,
        { kind: 'modules' },
        0,
        1
      );
    }
  }

  // RJ Baseline 2: missing policy on.
  if (extra.missingPolicyOn === false) {
    push(
      'missing_policy',
      'fix',
      'course',
      'Missing policy is off',
      '"Automatically apply grade for missing submissions" is off. Turn it on in the Gradebook: Settings (gear) → Late Policies. RJ Baseline 2.',
      { kind: 'gradebook' },
      0,
      2
    );
  }

  // RJ Baseline 3: grading kept current.
  if (typeof extra.waiting7 === 'number' && extra.waiting7 > 0) {
    push(
      'grading_waiting',
      'fix',
      'course',
      'Grading waiting 7+ days',
      `${extra.waiting7} ${extra.waiting7 === 1 ? 'submission has' : 'submissions have'} waited more than 7 days to be graded. RJ Baseline 3: keep grading current.`,
      { kind: 'gradebook' },
      0,
      3
    );
  }

  // RJ Baseline 3: a graded item every week (this week and next).
  if (course.termStart && course.termEnd && now.getTime() >= course.termStart && now.getTime() < course.termEnd) {
    const monday = mondayOf(now);
    const weeks: Array<{ start: Date; label: 'this' | 'next' }> = [];
    if (now.getDay() >= 1 && now.getDay() <= 4) weeks.push({ start: monday, label: 'this' }); // Mon–Thu: still time
    const nextMon = addDays(monday, 7);
    if (nextMon.getTime() < course.termEnd) weeks.push({ start: nextMon, label: 'next' });
    for (const w of weeks) {
      const end = addDays(w.start, 7).getTime();
      const any = published.some(
        (a) =>
          counts(a) &&
          datesOf(a).some((d) => {
            const due = parse(d.due_at);
            return !!due && whoFor(d).scope !== 'some' && due.getTime() >= w.start.getTime() && due.getTime() < end;
          })
      );
      if (any) continue;
      const range = `${formatDay(w.start)} – ${formatDay(addDays(w.start, 6))}`;
      push(
        'weekly_graded',
        w.label === 'this' ? 'fix' : 'check',
        dayKey(w.start).replace(/\D/g, ''),
        w.label === 'this' ? 'Nothing graded due this week' : 'Nothing graded due next week',
        `No graded assignment is due ${w.label} week (${range}). RJ Baseline 3: a graded item every week. A break week? Click Ignore.`,
        { kind: 'assignments_index' },
        w.start.getTime(),
        3
      );
    }
  }
}

export function reachableFromModules(modules: CanvasModule[]): {
  assignments: Set<string>;
  quizzes: Set<string>;
  discussions: Set<string>;
} {
  const r = { assignments: new Set<string>(), quizzes: new Set<string>(), discussions: new Set<string>() };
  for (const m of modules) {
    if (m.published === false) continue;
    for (const it of m.items ?? []) {
      if (it.published === false || it.content_id == null) continue;
      const id = String(it.content_id);
      if (it.type === 'Assignment') r.assignments.add(id);
      else if (it.type === 'Quiz') r.quizzes.add(id);
      else if (it.type === 'Discussion') r.discussions.add(id);
    }
  }
  return r;
}

function mondayOf(d: Date): Date {
  const day = startOfDay(d);
  const back = (day.getDay() + 6) % 7; // Monday = 0
  return addDays(day, -back);
}

function num(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

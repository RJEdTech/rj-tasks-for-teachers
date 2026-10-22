/*
  Course check-up: setup problems that confuse students or skew grades.
  Each rule is narrow on purpose: a check-up that cries wolf gets ignored.

  "fix"   — almost certainly a mistake (no due date, locks before due, ...)
  "check" — often intended, worth a look (0 points, midnight due time, ...)
*/
import { CanvasAssignment, CanvasAssignmentGroup, TeacherCourse } from '../lib/types';
import { addDays, formatDay, formatDayTime, isLocalMidnight, parse } from '../lib/dates';
import { datesOf, dueDates, isGraded } from './assignments';

export type Severity = 'fix' | 'check';
export type Rule =
  | 'no_due_date'
  | 'unpublished_due'
  | 'locks_before_due'
  | 'zero_points'
  | 'midnight_due'
  | 'weights_total'
  | 'zero_weight_group';

export interface Issue {
  key: string; // stable id used for "Ignore"
  course: TeacherCourse;
  rule: Rule;
  severity: Severity;
  title: string; // assignment or group name
  detail: string;
  link: { kind: 'assignment_edit'; assignmentId: string } | { kind: 'assignments_index' };
  sortDate: number;
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
  now: Date
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
  }

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

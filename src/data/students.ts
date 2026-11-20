/*
  Students to check on: in each class, students with several missing
  assignments this grading period. "Missing" is Canvas's own flag on the
  submission, so it already accounts for each student's due date, excused
  work and any missing/late status the teacher set.

  RJ expects a 0 for missing work, and Canvas drops its Missing flag as soon
  as a teacher types a grade, even a 0. So a 0 on online work the student
  never turned in, past their own due date, counts too (the same rule as
  RJ Tasks for Students' Catch Up).
*/
import {
  CanvasAssignment,
  CanvasGradingPeriod,
  CanvasSubmission,
  CanvasUser,
  TeacherCourse,
} from '../lib/types';
import { parse } from '../lib/dates';
import { byId, dueDates, isGraded } from './assignments';

export function currentPeriod(periods: CanvasGradingPeriod[], now: Date): CanvasGradingPeriod | null {
  return (
    periods.find((p) => {
      const s = parse(p.start_date);
      const e = parse(p.end_date);
      return (!s || s <= now) && (!e || now <= e);
    }) ?? null
  );
}

/* Assignments that could be missing for someone: published, graded, and past
   due for at least one section or student within the current period. */
export function pastDueIds(
  assignments: CanvasAssignment[],
  period: CanvasGradingPeriod | null,
  now: Date
): string[] {
  const start = parse(period?.start_date ?? null);
  const end = parse(period?.end_date ?? null);
  return assignments
    .filter((a) => a.published && isGraded(a))
    .filter((a) =>
      dueDates(a).some((d) => d < now && (!start || d >= start) && (!end || d <= end))
    )
    .map((a) => String(a.id));
}

/* Ways a student turns work in through Canvas itself (matches RJ Tasks for
   Students). Paper and "no submission" work has no online record, so a 0
   there can be a real score and is left alone. */
const ONLINE = new Set([
  'online_upload',
  'online_text_entry',
  'online_url',
  'media_recording',
  'student_annotation',
  'online_quiz',
  'discussion_topic',
  'external_tool', // e.g. VHL: a 0 there is real, undone work
]);

/* A 0 typed in for online work the student never turned in. */
export function isTypedZero(s: CanvasSubmission, a: CanvasAssignment, now: Date): boolean {
  if (s.excused || s.submitted_at) return false;
  if (['submitted', 'pending_review'].includes(s.workflow_state)) return false;
  if (s.score !== 0 || !((a.points_possible ?? 0) > 0) || !isGraded(a)) return false;
  if (!(a.submission_types ?? []).some((t) => ONLINE.has(t))) return false;
  const due = parse(s.cached_due_date ?? null) ?? parse(a.due_at);
  return !!due && due < now;
}

/* Missing for this list: Canvas's Missing flag, or a typed-in 0 (above). */
export function countsAsMissing(s: CanvasSubmission, a: CanvasAssignment | undefined, now: Date): boolean {
  if (s.excused) return false;
  if (s.missing) return true;
  return !!a && isTypedZero(s, a, now);
}

export interface MissingItem {
  assignmentId: string;
  name: string;
  dueAt: Date | null;
}

export interface StudentRow {
  course: TeacherCourse;
  userId: string;
  name: string;
  sortableName: string;
  missing: MissingItem[];
}

export function buildStudents(
  course: TeacherCourse,
  users: CanvasUser[],
  submissions: CanvasSubmission[],
  assignments: CanvasAssignment[],
  threshold: number,
  now: Date = new Date()
): StudentRow[] {
  const people = new Map(users.map((u) => [String(u.id), u]));
  const map = byId(assignments);
  const rows = new Map<string, StudentRow>();
  const seen = new Set<string>();
  for (const s of submissions) {
    const uid = String(s.user_id);
    const u = people.get(uid);
    const a = map.get(String(s.assignment_id));
    if (!countsAsMissing(s, a, now)) continue;
    if (!u || !a) continue; // dropped students, Test Student, unknown assignments
    const once = `${uid}:${a.id}`;
    if (seen.has(once)) continue;
    seen.add(once);
    let row = rows.get(uid);
    if (!row) {
      row = { course, userId: uid, name: u.name, sortableName: u.sortable_name || u.name, missing: [] };
      rows.set(uid, row);
    }
    row.missing.push({
      assignmentId: String(a.id),
      name: a.name,
      dueAt: parse(s.cached_due_date ?? null) ?? parse(a.due_at),
    });
  }
  return [...rows.values()]
    .filter((r) => r.missing.length >= threshold)
    .map((r) => ({
      ...r,
      missing: [...r.missing].sort((x, y) => (x.dueAt?.getTime() ?? 0) - (y.dueAt?.getTime() ?? 0)),
    }))
    .sort((a, b) => b.missing.length - a.missing.length || a.sortableName.localeCompare(b.sortableName));
}

/* Plain-text list for pasting into an email or advisor note. */
export function studentsAsText(rows: StudentRow[]): string {
  const lines: string[] = [];
  let course = '';
  for (const r of rows) {
    if (r.course.id !== course) {
      if (lines.length) lines.push('');
      course = r.course.id;
      lines.push(r.course.code === r.course.name ? r.course.name : `${r.course.code} · ${r.course.name}`);
    }
    lines.push(`${r.name} (${r.missing.length} missing): ${r.missing.map((m) => m.name).join('; ')}`);
  }
  return lines.join('\n');
}

export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

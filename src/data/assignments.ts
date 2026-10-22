import { AssignmentDate, CanvasAssignment } from '../lib/types';
import { parse } from '../lib/dates';

/* Every due/lock date set on an assignment: the base date plus each section or
   student override. Falls back to the top-level dates when Canvas leaves
   all_dates out (it does for assignments with very many overrides). */
export function datesOf(a: CanvasAssignment): AssignmentDate[] {
  if (a.all_dates && a.all_dates.length) return a.all_dates;
  return [{ base: true, due_at: a.due_at, lock_at: a.lock_at ?? null, unlock_at: a.unlock_at ?? null }];
}

export function dueDates(a: CanvasAssignment): Date[] {
  return datesOf(a)
    .map((d) => parse(d.due_at))
    .filter((d): d is Date => !!d);
}

/* Counts toward a grade in principle (not "Not graded", not omitted). */
export function isGraded(a: CanvasAssignment): boolean {
  return a.grading_type !== 'not_graded' && !a.omit_from_final_grade;
}

export function byId(list: CanvasAssignment[]): Map<string, CanvasAssignment> {
  return new Map(list.map((a) => [String(a.id), a]));
}

/*
  To grade: every assignment with submissions waiting, oldest wait first.
  Built from the submissions list (submitted + pending_review), so it counts
  each student's submission once and knows which are late or resubmitted.
*/
import { CanvasAssignment, CanvasSubmission, TeacherCourse } from '../lib/types';
import { parse } from '../lib/dates';
import { byId } from './assignments';

export interface GradingRow {
  course: TeacherCourse;
  assignmentId: string;
  name: string;
  count: number;
  late: number;
  resubmitted: number;
  review: number; // quiz answers waiting for manual review
  oldest: Date | null;
  dueAt: Date | null;
}

export function buildQueue(
  course: TeacherCourse,
  assignments: CanvasAssignment[],
  submissions: CanvasSubmission[]
): GradingRow[] {
  const map = byId(assignments);
  const rows = new Map<string, GradingRow>();
  const counted = new Set<string>();
  for (const s of submissions) {
    if (s.workflow_state !== 'submitted' && s.workflow_state !== 'pending_review') continue;
    if (s.excused) continue;
    const aid = String(s.assignment_id);
    const a = map.get(aid);
    if (!a || a.grading_type === 'not_graded') continue;
    const once = `${aid}:${s.user_id}`;
    if (counted.has(once)) continue;
    counted.add(once);
    let row = rows.get(aid);
    if (!row) {
      row = {
        course,
        assignmentId: aid,
        name: a.name,
        count: 0,
        late: 0,
        resubmitted: 0,
        review: 0,
        oldest: null,
        dueAt: parse(a.due_at),
      };
      rows.set(aid, row);
    }
    row.count++;
    if (s.late) row.late++;
    if (s.workflow_state === 'pending_review') row.review++;
    else if (s.grade != null && s.grade_matches_current_submission === false) row.resubmitted++;
    const at = parse(s.submitted_at);
    if (at && (!row.oldest || at < row.oldest)) row.oldest = at;
  }
  return [...rows.values()];
}

/* When the submissions list can't be read, Canvas's own per-assignment
   needs_grading_count still gives the numbers (without ages or late flags). */
export function queueFromCounts(course: TeacherCourse, assignments: CanvasAssignment[]): GradingRow[] {
  return assignments
    .filter((a) => (a.needs_grading_count ?? 0) > 0 && a.grading_type !== 'not_graded')
    .map((a) => ({
      course,
      assignmentId: String(a.id),
      name: a.name,
      count: a.needs_grading_count ?? 0,
      late: 0,
      resubmitted: 0,
      review: 0,
      oldest: null,
      dueAt: parse(a.due_at),
    }));
}

/* Oldest wait first; rows without an age go last, then most to grade. */
export function sortQueue(rows: GradingRow[]): GradingRow[] {
  return [...rows].sort((a, b) => {
    if (a.oldest && b.oldest && a.oldest.getTime() !== b.oldest.getTime())
      return a.oldest.getTime() - b.oldest.getTime();
    if (a.oldest && !b.oldest) return -1;
    if (!a.oldest && b.oldest) return 1;
    return b.count - a.count || a.name.localeCompare(b.name);
  });
}

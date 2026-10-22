import { CanvasCourse, TeacherCourse } from '../lib/types';
import { parse } from '../lib/dates';

const TEACHING = new Set(['teacher', 'ta']);

/* A published course this person teaches (or TAs) that hasn't ended. */
export function isCurrentTeachingCourse(c: CanvasCourse, now: Date): boolean {
  if (!c.enrollments?.some((e) => TEACHING.has(e.type))) return false;
  if (c.workflow_state !== undefined && c.workflow_state !== 'available') return false;
  // A course's own end date only counts when Canvas enforces it; otherwise the term's does.
  const end =
    (c.restrict_enrollments_to_course_dates ? parse(c.end_at) : null) ?? parse(c.term?.end_at ?? null);
  if (end && end.getTime() < now.getTime()) return false;
  return true;
}

export function toTeacherCourse(c: CanvasCourse): TeacherCourse {
  return {
    id: String(c.id),
    name: c.name || c.course_code || 'Course',
    code: c.course_code || c.name || 'Course',
    weighted: !!c.apply_assignment_group_weights,
  };
}

export function teacherCourses(
  all: CanvasCourse[],
  now: Date,
  excluded: string[] = []
): TeacherCourse[] {
  const skip = new Set(excluded.map(String));
  return all
    .filter((c) => isCurrentTeachingCourse(c, now))
    .map(toTeacherCourse)
    .filter((c) => !skip.has(c.id))
    .sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));
}

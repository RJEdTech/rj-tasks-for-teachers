import { CanvasCourse, CanvasTerm, TeacherCourse } from '../lib/types';
import { parse } from '../lib/dates';
import { REVIEW_COURSE_IDS } from '../lib/constants';

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

/*
  RJ's academic classes come from the SIS in terms named like
  "2026/2027 - Regis Jesuit High School - 1st Semester". Every course in those
  terms sits under Academic Courses in Canvas; PD, RaiderQuest, clubs,
  templates and sandboxes use other terms (Professional Development,
  Activities, Default Term, Master Templates, Year-Long Activities, Summer).
  Retired terms start with "x".
*/
const SEMESTER = /\b(1st|2nd)\s+semester\b/i;

export function isSemesterTerm(t: CanvasTerm | null | undefined): boolean {
  const name = (t?.name ?? '').trim();
  return SEMESTER.test(name) && !/summer/i.test(name) && !/^x/i.test(name);
}

/* The semester term in session right now (start <= now < end), if any. */
export function isCurrentSemester(t: CanvasTerm | null | undefined, now: Date): boolean {
  if (!isSemesterTerm(t)) return false;
  const start = parse(t!.start_at ?? null);
  const end = parse(t!.end_at ?? null);
  if (!start || !end) return false;
  return start.getTime() <= now.getTime() && now.getTime() < end.getTime();
}

/* Courses the extension shows: current-semester academic classes, plus the
   Microsoft certification sandbox so Edge Add-ons reviewers can test it.
   With allClasses on, every current class the teacher teaches (the 1.0 behavior). */
export function isShownCourse(c: CanvasCourse, now: Date, allClasses = false): boolean {
  if (!isCurrentTeachingCourse(c, now)) return false;
  if (allClasses) return true;
  return isCurrentSemester(c.term, now) || REVIEW_COURSE_IDS.includes(String(c.id));
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
  excluded: string[] = [],
  allClasses = false
): TeacherCourse[] {
  const skip = new Set(excluded.map(String));
  return all
    .filter((c) => isShownCourse(c, now, allClasses))
    .map(toTeacherCourse)
    .filter((c) => !skip.has(c.id))
    .sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));
}

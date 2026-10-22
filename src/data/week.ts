/*
  Your week: what's due from your classes each of the next 7 days, and a flag
  when one class (or one section, if dates are set per section) has two or
  more graded items due the same day.

  Teachers can only see the courses they teach, so this can't show what
  students have due in other classes.
*/
import { AssignmentDate, CanvasAssignment, TeacherCourse } from '../lib/types';
import { addDays, dayKey, parse, startOfDay } from '../lib/dates';
import { datesOf, isGraded } from './assignments';

export interface WeekItem {
  course: TeacherCourse;
  assignmentId: string;
  name: string;
  dueAt: Date;
  points: number | null;
  graded: boolean;
  /* who this date is for: null = the whole class; otherwise a section name,
     or e.g. "1 student" for an individual extension */
  forWhom: string | null;
  scope: 'all' | 'section' | 'some';
}

export interface WeekFlag {
  course: TeacherCourse;
  forWhom: string | null;
  count: number;
}

export interface WeekDay {
  date: Date;
  key: string;
  items: WeekItem[];
  flags: WeekFlag[];
}

export function buildWeek(
  data: Array<{ course: TeacherCourse; assignments: CanvasAssignment[] }>,
  now: Date,
  days = 7
): WeekDay[] {
  const first = startOfDay(now);
  const out: WeekDay[] = Array.from({ length: days }, (_, i) => {
    const date = addDays(first, i);
    return { date, key: dayKey(date), items: [], flags: [] };
  });
  const index = new Map(out.map((d) => [d.key, d]));

  for (const { course, assignments } of data) {
    for (const a of assignments) {
      if (!a.published) continue;
      const seenHere = new Set<string>();
      for (const d of datesOf(a)) {
        const due = parse(d.due_at);
        if (!due) continue;
        const day = index.get(dayKey(due));
        if (!day) continue;
        const { scope, forWhom } = whoFor(d);
        const k = `${day.key}:${forWhom ?? ''}`;
        if (seenHere.has(k)) continue;
        seenHere.add(k);
        day.items.push({
          course,
          assignmentId: String(a.id),
          name: a.name,
          dueAt: due,
          points: a.points_possible,
          graded: isGraded(a) && (a.points_possible ?? 0) > 0,
          forWhom,
          scope,
        });
      }
    }
  }

  for (const day of out) {
    day.items.sort(
      (x, y) =>
        x.dueAt.getTime() - y.dueAt.getTime() ||
        x.course.code.localeCompare(y.course.code, 'en', { numeric: true }) ||
        x.name.localeCompare(y.name)
    );
    day.flags = flagsFor(day.items);
  }
  return out;
}

const STUDENTS_TITLE = /^\d+ students?$/i;

/* Classify one due date: the whole class, one section, or a few students
   (an individual extension or a group). */
export function whoFor(d: AssignmentDate): { scope: WeekItem['scope']; forWhom: string | null } {
  if (d.base) return { scope: 'all', forWhom: null };
  const title = (d.title || '').trim();
  if (d.set_type === 'ADHOC' || d.set_type === 'Group' || STUDENTS_TITLE.test(title))
    return { scope: 'some', forWhom: title || 'some students' };
  if (d.set_type === 'CourseSection' || title) return { scope: 'section', forWhom: title || null };
  return { scope: 'all', forWhom: null };
}

/* A day is flagged when one class has 2+ graded items due for everyone, or
   when a section's own dates plus the whole-class dates reach 2. Dates for a
   few students (extensions) never count. */
export function flagsFor(items: WeekItem[]): WeekFlag[] {
  const flags: WeekFlag[] = [];
  const byCourse = new Map<string, WeekItem[]>();
  for (const it of items) {
    if (!it.graded || it.scope === 'some') continue;
    const list = byCourse.get(it.course.id) ?? [];
    list.push(it);
    byCourse.set(it.course.id, list);
  }
  for (const list of byCourse.values()) {
    const course = list[0].course;
    const everyone = list.filter((i) => i.scope === 'all').length;
    if (everyone >= 2) flags.push({ course, forWhom: null, count: everyone });
    const sections = new Map<string, number>();
    for (const i of list) if (i.scope === 'section' && i.forWhom) sections.set(i.forWhom, (sections.get(i.forWhom) ?? 0) + 1);
    for (const [name, n] of sections) if (everyone + n >= 2) flags.push({ course, forWhom: name, count: everyone + n });
  }
  return flags;
}

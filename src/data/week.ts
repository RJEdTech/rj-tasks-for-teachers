/*
  Your week: what's due from your classes each of the next 7 days, and a flag
  when one class (or one section, if dates are set per section) has two or
  more graded items due the same day.

  Teachers can only see the courses they teach, so this can't show what
  students have due in other classes.
*/
import { CanvasAssignment, TeacherCourse } from '../lib/types';
import { addDays, dayKey, parse, startOfDay } from '../lib/dates';
import { datesOf, isGraded } from './assignments';

export interface WeekItem {
  course: TeacherCourse;
  assignmentId: string;
  name: string;
  dueAt: Date;
  points: number | null;
  graded: boolean;
  forWhom: string | null; // section name when the date is a section override
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
        const forWhom = d.set_type === 'CourseSection' && d.title ? d.title : null;
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
    const groups = new Map<string, WeekFlag>();
    for (const it of day.items) {
      if (!it.graded) continue;
      const k = `${it.course.id}:${it.forWhom ?? ''}`;
      const g = groups.get(k) ?? { course: it.course, forWhom: it.forWhom, count: 0 };
      g.count++;
      groups.set(k, g);
    }
    day.flags = [...groups.values()].filter((g) => g.count >= 2);
  }
  return out;
}

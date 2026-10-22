/*
  Fetches what each panel tab needs, once per panel session. Nothing is
  written to disk: results live in memory and are gone when the tab closes
  or the teacher clicks Refresh.
*/
import { assertId, canvasGet, canvasGetAll, mapLimit } from '../lib/canvasApi';
import {
  CanvasAssignment,
  CanvasAssignmentGroup,
  CanvasCourse,
  CanvasGradingPeriod,
  CanvasSubmission,
  CanvasUser,
  TeacherCourse,
} from '../lib/types';
import { teacherCourses } from './courses';
import { buildQueue, GradingRow, queueFromCounts, sortQueue } from './grading';
import { Issue, runCheckup, sortIssues } from './checkup';
import { buildStudents, chunk, currentPeriod, pastDueIds, StudentRow } from './students';
import { buildWeek, WeekDay } from './week';

const PARALLEL = 3;
const IDS_PER_REQUEST = 20;

export interface Loaded<T> {
  value: T;
  /* classes whose data couldn't be read (shown as a note, not an error page) */
  failed: TeacherCourse[];
  /* true when a list was cut short at the page limit */
  partial: boolean;
}

interface CourseMissing {
  course: TeacherCourse;
  users: CanvasUser[];
  assignments: CanvasAssignment[];
  submissions: CanvasSubmission[];
  partial: boolean;
  periodKnown: boolean;
}

export class Loader {
  private memo = new Map<string, Promise<unknown>>();
  constructor(private now: () => Date = () => new Date()) {}

  reset(): void {
    this.memo.clear();
  }

  private once<T>(key: string, fn: () => Promise<T>): Promise<T> {
    let p = this.memo.get(key) as Promise<T> | undefined;
    if (!p) {
      p = fn();
      this.memo.set(key, p);
      p.catch(() => this.memo.delete(key));
    }
    return p;
  }

  courses(excluded: string[] = []): Promise<TeacherCourse[]> {
    return this.once('courses', async () => {
      const { items } = await canvasGetAll<CanvasCourse>(
        '/api/v1/courses?enrollment_state=active&include[]=term&per_page=100'
      );
      return items;
    }).then((all) => teacherCourses(all, this.now(), excluded));
  }

  assignments(cid: string): Promise<CanvasAssignment[]> {
    const id = assertId(cid);
    return this.once(`a:${id}`, async () => {
      const { items } = await canvasGetAll<CanvasAssignment>(
        `/api/v1/courses/${id}/assignments?include[]=all_dates&per_page=100`
      );
      return items;
    });
  }

  groups(cid: string): Promise<CanvasAssignmentGroup[]> {
    const id = assertId(cid);
    return this.once(`g:${id}`, async () => {
      const { items } = await canvasGetAll<CanvasAssignmentGroup>(
        `/api/v1/courses/${id}/assignment_groups?per_page=100`
      );
      return items;
    });
  }

  /* Active students only: the Test Student, dropped and concluded students are left out. */
  private users(cid: string): Promise<CanvasUser[]> {
    const id = assertId(cid);
    return this.once(`u:${id}`, async () => {
      const { items } = await canvasGetAll<CanvasUser>(
        `/api/v1/courses/${id}/users?enrollment_type[]=student&enrollment_state[]=active&per_page=100`
      );
      return items;
    });
  }

  private activeOnly(subs: CanvasSubmission[], users: CanvasUser[] | null): CanvasSubmission[] {
    if (!users) return subs;
    const ids = new Set(users.map((u) => String(u.id)));
    return subs.filter((s) => ids.has(String(s.user_id)));
  }

  private toGradeSubmissions(cid: string): Promise<{ subs: CanvasSubmission[]; partial: boolean }> {
    const id = assertId(cid);
    return this.once(`s:${id}`, async () => {
      const lists = await Promise.all(
        ['submitted', 'pending_review'].map((state) =>
          canvasGetAll<CanvasSubmission>(
            `/api/v1/courses/${id}/students/submissions?student_ids[]=all&enrollment_state=active&workflow_state=${state}&per_page=100`
          )
        )
      );
      return { subs: lists.flatMap((l) => l.items), partial: lists.some((l) => l.truncated) };
    });
  }

  async toGrade(courses: TeacherCourse[]): Promise<Loaded<GradingRow[]>> {
    const failed: TeacherCourse[] = [];
    let partial = false;
    const rows = await mapLimit(courses, PARALLEL, async (c) => {
      let assignments: CanvasAssignment[];
      try {
        assignments = await this.assignments(c.id);
      } catch {
        failed.push(c);
        return [];
      }
      try {
        const [r, users] = await Promise.all([
          this.toGradeSubmissions(c.id),
          this.users(c.id).catch(() => null),
        ]);
        partial ||= r.partial;
        return buildQueue(c, assignments, this.activeOnly(r.subs, users));
      } catch {
        return queueFromCounts(c, assignments);
      }
    });
    return { value: sortQueue(rows.flat()), failed, partial };
  }

  async checkup(courses: TeacherCourse[], ignored: Set<string>): Promise<Loaded<Issue[]>> {
    const failed: TeacherCourse[] = [];
    const now = this.now();
    const all = await mapLimit(courses, PARALLEL, async (c) => {
      try {
        const [a, g] = await Promise.all([this.assignments(c.id), this.groups(c.id)]);
        return runCheckup(c, a, g, now);
      } catch {
        failed.push(c);
        return [];
      }
    });
    return { value: sortIssues(all.flat().filter((i) => !ignored.has(i.key))), failed, partial: false };
  }

  private async period(cid: string): Promise<CanvasGradingPeriod | null> {
    const id = assertId(cid);
    try {
      const r = await this.once(`p:${id}`, () =>
        canvasGet<{ grading_periods?: CanvasGradingPeriod[] }>(
          `/api/v1/courses/${id}/grading_periods?per_page=100`
        )
      );
      return currentPeriod(r?.grading_periods ?? [], this.now());
    } catch {
      return null; // no grading periods (or no access): use the whole course
    }
  }

  /* Every submission Canvas flags Missing, whatever its state: Canvas's
     missing-submission policy grades missing work (state "graded") but keeps
     the Missing flag, and so does a teacher's own "Missing" mark with a 0. */
  private missing(c: TeacherCourse): Promise<CourseMissing> {
    const id = assertId(c.id);
    return this.once(`m:${id}`, async () => {
      const [assignments, period, users] = await Promise.all([
        this.assignments(id),
        this.period(id),
        this.users(id),
      ]);
      const ids = pastDueIds(assignments, period, this.now());
      const submissions: CanvasSubmission[] = [];
      let partial = false;
      for (const part of chunk(ids, IDS_PER_REQUEST)) {
        const q = part.map((a) => `assignment_ids[]=${assertId(a)}`).join('&');
        const r = await canvasGetAll<CanvasSubmission>(
          `/api/v1/courses/${id}/students/submissions?student_ids[]=all&enrollment_state=active&${q}&per_page=100`
        );
        partial ||= r.truncated;
        submissions.push(...r.items.filter((s) => s.missing && !s.excused));
      }
      return { course: c, users, assignments, submissions, partial, periodKnown: !!period };
    });
  }

  async students(
    courses: TeacherCourse[],
    threshold: number
  ): Promise<Loaded<StudentRow[]> & { periodKnown: boolean }> {
    const failed: TeacherCourse[] = [];
    let partial = false;
    let periodKnown = true;
    const rows = await mapLimit(courses, PARALLEL, async (c) => {
      try {
        const m = await this.missing(c);
        partial ||= m.partial;
        periodKnown &&= m.periodKnown;
        return buildStudents(c, m.users, m.submissions, m.assignments, threshold);
      } catch {
        failed.push(c);
        return [];
      }
    });
    return { value: rows.flat(), failed, partial, periodKnown };
  }

  async week(courses: TeacherCourse[]): Promise<Loaded<WeekDay[]>> {
    const failed: TeacherCourse[] = [];
    const data = await mapLimit(courses, PARALLEL, async (c) => {
      try {
        return { course: c, assignments: await this.assignments(c.id) };
      } catch {
        failed.push(c);
        return { course: c, assignments: [] };
      }
    });
    return { value: buildWeek(data, this.now()), failed, partial: false };
  }
}

/* Canvas's own count of assignments with something to grade, for the button badge. */
export async function needsGradingCount(): Promise<number | null> {
  try {
    const r = await canvasGet<{ needs_grading_count?: number }>('/api/v1/users/self/todo_item_count');
    return typeof r?.needs_grading_count === 'number' ? r.needs_grading_count : null;
  } catch {
    return null;
  }
}

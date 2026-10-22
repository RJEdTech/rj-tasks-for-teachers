import { teacherCourses, isCurrentTeachingCourse } from '../src/data/courses';
import { buildQueue, queueFromCounts, sortQueue } from '../src/data/grading';
import { runCheckup, sortIssues } from '../src/data/checkup';
import { buildStudents, currentPeriod, pastDueIds, studentsAsText, chunk } from '../src/data/students';
import { buildWeek } from '../src/data/week';
import { CanvasAssignment, CanvasCourse, CanvasSubmission, TeacherCourse } from '../src/lib/types';

// Thursday Oct 22 2026, 10:00 AM in Denver (tests run with TZ=America/Denver)
const NOW = new Date(2026, 9, 22, 10, 0, 0);
const at = (d: number, h = 23, m = 59) => new Date(2026, 9, d, h, m).toISOString();

const ALG: TeacherCourse = { id: '1', name: 'Algebra 1', code: 'ALGEBRA 1', weighted: true };
const GEO: TeacherCourse = { id: '2', name: 'Geometry', code: 'GEOMETRY', weighted: false };

function a(over: Partial<CanvasAssignment> & { id: string }): CanvasAssignment {
  return {
    name: `Assignment ${over.id}`,
    published: true,
    due_at: at(20),
    points_possible: 10,
    grading_type: 'points',
    assignment_group_id: 'g1',
    ...over,
  };
}

describe('courses', () => {
  const base: CanvasCourse = { id: '1', name: 'Algebra 1', course_code: 'ALGEBRA 1', workflow_state: 'available', enrollments: [{ type: 'teacher' }] };
  it('keeps current courses where you are teacher or TA', () => {
    expect(isCurrentTeachingCourse(base, NOW)).toBe(true);
    expect(isCurrentTeachingCourse({ ...base, enrollments: [{ type: 'ta' }] }, NOW)).toBe(true);
  });
  it('drops student/observer enrollments, ended courses and ended terms', () => {
    expect(isCurrentTeachingCourse({ ...base, enrollments: [{ type: 'student' }] }, NOW)).toBe(false);
    expect(isCurrentTeachingCourse({ ...base, end_at: at(1) }, NOW)).toBe(false);
    expect(isCurrentTeachingCourse({ ...base, term: { end_at: '2026-05-30T06:00:00Z' } }, NOW)).toBe(false);
    expect(isCurrentTeachingCourse({ ...base, workflow_state: 'completed' }, NOW)).toBe(false);
  });
  it('applies exclusions and sorts by code', () => {
    const list = teacherCourses(
      [
        { ...base, id: '3', course_code: 'THEOLOGY 9', name: 'Theology 9' },
        base,
        { ...base, id: '9', course_code: 'SANDBOX', name: 'Sandbox' },
      ],
      NOW,
      ['9']
    );
    expect(list.map((c) => c.code)).toEqual(['ALGEBRA 1', 'THEOLOGY 9']);
  });
});

describe('grading queue', () => {
  const assignments = [a({ id: '10', name: 'Quiz 3' }), a({ id: '11', name: 'Essay' }), a({ id: '12', grading_type: 'not_graded' })];
  const sub = (o: Partial<CanvasSubmission>): CanvasSubmission => ({
    assignment_id: '10',
    user_id: 'u1',
    workflow_state: 'submitted',
    submitted_at: at(18, 9, 0),
    ...o,
  });

  it('counts each student once, with late, resubmitted and quiz review', () => {
    const rows = buildQueue(ALG, assignments, [
      sub({ user_id: 'u1', late: true }),
      sub({ user_id: 'u1' }), // duplicate
      sub({ user_id: 'u2', grade: 'B', grade_matches_current_submission: false, submitted_at: at(15, 8, 0) }),
      sub({ user_id: 'u3', workflow_state: 'pending_review' }),
      sub({ user_id: 'u4', excused: true }),
      sub({ user_id: 'u5', workflow_state: 'graded' }),
      sub({ user_id: 'u6', assignment_id: '12' }), // not graded
      sub({ user_id: 'u7', assignment_id: '999' }), // unknown
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Quiz 3', count: 3, late: 1, resubmitted: 1, review: 1 });
    expect(rows[0].oldest?.toISOString()).toBe(at(15, 8, 0));
  });

  it('sorts oldest wait first, unknown ages last', () => {
    const rows = sortQueue([
      ...buildQueue(ALG, assignments, [sub({ assignment_id: '11', submitted_at: at(20, 9, 0) })]),
      ...buildQueue(GEO, assignments, [sub({ submitted_at: at(10, 9, 0) })]),
      ...queueFromCounts(GEO, [a({ id: '50', needs_grading_count: 9 })]),
    ]);
    expect(rows.map((r) => r.assignmentId)).toEqual(['10', '11', '50']);
  });

  it('falls back to needs_grading_count', () => {
    const rows = queueFromCounts(ALG, [a({ id: '1', needs_grading_count: 4 }), a({ id: '2', needs_grading_count: 0 })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(4);
  });
});

describe('check-up', () => {
  const groups = [
    { id: 'g1', name: 'Homework', group_weight: 30 },
    { id: 'g2', name: 'Tests', group_weight: 60 },
    { id: 'g3', name: 'Participation', group_weight: 0 },
  ];
  const run = (list: CanvasAssignment[], course = ALG, g = groups) =>
    runCheckup(course, list, g, NOW).map((i) => `${i.rule}:${i.key.split(':')[2]}`);

  it('flags a published graded assignment with no due date anywhere', () => {
    expect(run([a({ id: '1', due_at: null })], GEO)).toEqual(['no_due_date:1']);
    // a section override date counts as a due date
    expect(
      run([a({ id: '2', due_at: null, all_dates: [{ base: true, due_at: null }, { due_at: at(25), set_type: 'CourseSection', title: 'P3' }] })], GEO)
    ).toEqual([]);
    // not graded, or unpublished: no flag
    expect(run([a({ id: '3', due_at: null, grading_type: 'not_graded' }), a({ id: '4', due_at: null, published: false })], GEO)).toEqual([]);
  });

  it('flags unpublished work due within 3 days or in the last 2 weeks', () => {
    expect(run([a({ id: '1', published: false, due_at: at(24) })], GEO)).toEqual(['unpublished_due:1']);
    expect(run([a({ id: '2', published: false, due_at: at(20) })], GEO)).toEqual(['unpublished_due:2']);
    expect(run([a({ id: '3', published: false, due_at: at(30) })], GEO)).toEqual([]); // far future: on purpose
    expect(run([a({ id: '4', published: false, due_at: at(1) })], GEO)).toEqual([]); // old leftover
  });

  it('flags a lock date before the due date', () => {
    expect(run([a({ id: '1', due_at: at(26), lock_at: at(26, 15, 0) })], GEO)).toEqual(['locks_before_due:1']);
    expect(run([a({ id: '2', due_at: at(26), lock_at: at(27) })], GEO)).toEqual([]);
  });

  it('flags 0-point graded assignments as worth a look', () => {
    const r = runCheckup(GEO, [a({ id: '1', points_possible: 0 }), a({ id: '2', points_possible: 0, grading_type: 'pass_fail' })], [], NOW);
    expect(r.map((i) => [i.rule, i.severity])).toEqual([['zero_points', 'check']]);
  });

  it('flags upcoming 12:00 AM due times and names the right nights', () => {
    const r = runCheckup(GEO, [a({ id: '1', due_at: at(27, 0, 0) }), a({ id: '2', due_at: at(15, 0, 0) })], [], NOW);
    expect(r).toHaveLength(1);
    expect(r[0].rule).toBe('midnight_due');
    expect(r[0].detail).toContain('12:00 AM on Tue, Oct 27');
    expect(r[0].detail).toContain('end of Monday');
  });

  it('flags weights that do not total 100 and 0% groups with graded work', () => {
    const r = runCheckup(ALG, [a({ id: '1', assignment_group_id: 'g3' })], groups, NOW);
    expect(r.map((i) => i.rule).sort()).toEqual(['weights_total', 'zero_weight_group']);
    expect(r.find((i) => i.rule === 'weights_total')!.detail).toContain('90%');
    // unweighted course: weights ignored
    expect(runCheckup(GEO, [a({ id: '1', assignment_group_id: 'g3' })], groups, NOW)).toEqual([]);
    // exact 100: fine
    expect(runCheckup(ALG, [], [{ id: 'g1', name: 'All', group_weight: 100 }], NOW)).toEqual([]);
  });

  it('sorts fixes before checks', () => {
    const r = sortIssues(runCheckup(GEO, [a({ id: '1', points_possible: 0 }), a({ id: '2', due_at: null })], [], NOW));
    expect(r.map((i) => i.severity)).toEqual(['fix', 'check']);
  });
});

describe('students to check on', () => {
  const assignments = [
    a({ id: '1', name: 'HW 1', due_at: at(5) }),
    a({ id: '2', name: 'HW 2', due_at: at(12) }),
    a({ id: '3', name: 'HW 3', due_at: at(19) }),
    a({ id: '4', name: 'Next week', due_at: at(29) }),
    a({ id: '5', name: 'Draft', due_at: at(8), published: false }),
    a({ id: '6', name: 'Last quarter', due_at: '2026-09-01T05:59:00Z' }),
  ];
  const users = [
    { id: 'u1', name: 'Avery Cole', sortable_name: 'Cole, Avery' },
    { id: 'u2', name: 'Blake Diaz', sortable_name: 'Diaz, Blake' },
  ];
  const miss = (u: string, aid: string, o: Partial<CanvasSubmission> = {}): CanvasSubmission => ({
    user_id: u, assignment_id: aid, workflow_state: 'unsubmitted', submitted_at: null, missing: true, ...o,
  });

  it('picks the current grading period', () => {
    const p = currentPeriod(
      [
        { id: 'q1', title: 'Q1', start_date: '2026-08-15T06:00:00Z', end_date: '2026-10-10T06:00:00Z' },
        { id: 'q2', title: 'Q2', start_date: '2026-10-10T06:00:00Z', end_date: '2026-12-20T06:00:00Z' },
      ],
      NOW
    );
    expect(p?.id).toBe('q2');
  });

  it('only asks about published, graded, past-due work in the period', () => {
    const period = { id: 'q2', title: 'Q2', start_date: '2026-10-01T06:00:00Z', end_date: '2026-12-20T06:00:00Z' };
    expect(pastDueIds(assignments, period, NOW)).toEqual(['1', '2', '3']);
    expect(pastDueIds(assignments, null, NOW)).toEqual(['1', '2', '3', '6']);
  });

  it('lists students at or over the threshold, most missing first', () => {
    const rows = buildStudents(
      ALG,
      users,
      [
        miss('u1', '1'), miss('u1', '2'), miss('u1', '3'),
        miss('u2', '1'), miss('u2', '2'), miss('u2', '3', { excused: true }),
        miss('u2', '2'), // duplicate
        miss('u9', '1'), miss('u9', '2'), miss('u9', '3'), // not an active student
        miss('u1', '1', { missing: false }),
      ],
      assignments,
      2
    );
    expect(rows.map((r) => [r.name, r.missing.length])).toEqual([['Avery Cole', 3], ['Blake Diaz', 2]]);
    expect(rows[0].missing.map((m) => m.name)).toEqual(['HW 1', 'HW 2', 'HW 3']);
    expect(buildStudents(ALG, users, [miss('u1', '1')], assignments, 3)).toEqual([]);
  });

  it('copies as plain text grouped by class', () => {
    const rows = buildStudents(ALG, users, [miss('u1', '1'), miss('u1', '2')], assignments, 1);
    expect(studentsAsText(rows)).toBe('ALGEBRA 1\nAvery Cole (2 missing): HW 1; HW 2');
  });

  it('chunks assignment ids', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe('your week', () => {
  it('lists the next 7 days and flags 2+ graded items for one class or section on a day', () => {
    const days = buildWeek(
      [
        {
          course: ALG,
          assignments: [
            a({ id: '1', name: 'Quiz', due_at: at(23, 8, 0) }),
            a({ id: '2', name: 'HW', due_at: at(23) }),
            a({ id: '3', name: 'Practice', due_at: at(23), grading_type: 'not_graded' }),
            a({ id: '4', name: 'Hidden', due_at: at(23), published: false }),
            a({ id: '5', name: 'Too far', due_at: at(30) }),
            a({ id: '6', name: 'Past', due_at: at(21) }),
          ],
        },
        {
          course: GEO,
          assignments: [
            a({ id: '7', name: 'Lab', due_at: null, all_dates: [{ base: true, due_at: at(24) }, { due_at: at(26), set_type: 'CourseSection', title: 'Period 3' }] }),
            a({ id: '8', name: 'Test', due_at: at(26), all_dates: [{ due_at: at(26), set_type: 'CourseSection', title: 'Period 3' }] }),
          ],
        },
      ],
      NOW
    );
    expect(days).toHaveLength(7);
    expect(days[0].key).toBe('2026-10-22');
    const fri = days[1];
    expect(fri.items.map((i) => i.name)).toEqual(['Quiz', 'HW', 'Practice']);
    expect(fri.flags).toEqual([{ course: ALG, forWhom: null, count: 2 }]);
    const sat = days[2];
    expect(sat.items.map((i) => i.name)).toEqual(['Lab']);
    const mon = days[4];
    expect(mon.items.map((i) => `${i.name}/${i.forWhom}`)).toEqual(['Lab/Period 3', 'Test/Period 3']);
    expect(mon.flags).toEqual([{ course: GEO, forWhom: 'Period 3', count: 2 }]);
  });
});

import { teacherCourses, isCurrentTeachingCourse, isSemesterTerm, isCurrentSemester, isShownCourse } from '../src/data/courses';
import { buildQueue, queueFromCounts, sortQueue } from '../src/data/grading';
import { runCheckup, sortIssues, activeWeeksOf } from '../src/data/checkup';
import { buildStudents, currentPeriod, pastDueIds, studentsAsText, chunk } from '../src/data/students';
import { buildWeek, buildForecast, needsTeacherGrading } from '../src/data/week';
import { countWaiting } from '../src/data/grading';
import { clean, normalizeOrder } from '../src/lib/settings';
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
  // RJ's real terms, as Canvas returns them with include[]=term
  const S1 = { id: '585', name: '2026/2027 - Regis Jesuit High School - 1st Semester', start_at: '2026-07-11T06:00:00Z', end_at: '2027-01-01T06:59:00Z' };
  const S2 = { id: '586', name: '2026/2027 - Regis Jesuit High School - 2nd Semester', start_at: '2027-01-01T07:00:00Z', end_at: '2027-06-01T05:59:00Z' };
  const PD = { id: '187', name: 'Professional Development', start_at: null, end_at: null };
  const DEF = { id: '1', name: 'Default Term', start_at: null, end_at: null };
  const ACT = { id: '588', name: '2026/2027 - Regis Jesuit High School - Year-Long Activities', start_at: '2026-06-01T06:00:00Z', end_at: '2027-06-01T05:59:00Z' };
  const SUM = { id: '587', name: '2026/2027 - Regis Jesuit High School - Summer Semester', start_at: '2026-06-01T06:00:00Z', end_at: '2026-07-11T05:59:00Z' };
  const OLD = { id: '365', name: 'x2022/2023 - Regis Jesuit High School - 1st Semester', start_at: '2022-07-18T06:00:00Z', end_at: '2023-01-01T06:59:00Z' };
  const base: CanvasCourse = { id: '1', name: 'Algebra 1', course_code: 'ALGEBRA 1', workflow_state: 'available', enrollments: [{ type: 'teacher' }], term: S1 };
  it('keeps current courses where you are teacher or TA', () => {
    expect(isCurrentTeachingCourse(base, NOW)).toBe(true);
    expect(isCurrentTeachingCourse({ ...base, enrollments: [{ type: 'ta' }] }, NOW)).toBe(true);
  });
  it('drops student/observer enrollments, ended courses and ended terms', () => {
    expect(isCurrentTeachingCourse({ ...base, enrollments: [{ type: 'student' }] }, NOW)).toBe(false);
    expect(isCurrentTeachingCourse({ ...base, end_at: at(1), restrict_enrollments_to_course_dates: true }, NOW)).toBe(false);
    // a course end date Canvas doesn't enforce (common in copied courses) is ignored
    expect(isCurrentTeachingCourse({ ...base, end_at: at(1) }, NOW)).toBe(true);
    expect(isCurrentTeachingCourse({ ...base, workflow_state: 'unpublished' }, NOW)).toBe(false);
    expect(isCurrentTeachingCourse({ ...base, term: { end_at: '2026-05-30T06:00:00Z' } }, NOW)).toBe(false);
    expect(isCurrentTeachingCourse({ ...base, workflow_state: 'completed' }, NOW)).toBe(false);
  });
  it('knows which terms are RJ semesters', () => {
    expect([S1, S2].every(isSemesterTerm)).toBe(true);
    expect([PD, DEF, ACT, SUM, OLD, null, undefined].some(isSemesterTerm)).toBe(false);
  });
  it('picks the semester in session by its dates (and the next one 14 days early)', () => {
    expect(isCurrentSemester(S1, NOW)).toBe(true);
    expect(isCurrentSemester(S2, NOW)).toBe(false);
    expect(isCurrentSemester(S2, new Date(2026, 11, 17))).toBe(false); // 15 days before
    expect(isCurrentSemester(S2, new Date(2026, 11, 19))).toBe(true); // over break: prep next semester
    expect(isCurrentSemester({ ...S1, start_at: null }, NOW)).toBe(true); // no start date: counts as started
    expect(isCurrentSemester({ ...S1, start_at: null, end_at: null }, NOW)).toBe(true);
    expect(isCurrentSemester(S2, new Date(2027, 1, 3))).toBe(true);
    expect(isCurrentSemester(S1, new Date(2027, 1, 3))).toBe(false);
    // the 1st/2nd semester boundary (Dec 31 11:59 PM -> Jan 1 12:00 AM Denver)
    expect(isCurrentSemester(S1, new Date('2027-01-01T06:58:00Z'))).toBe(true);
    expect(isCurrentSemester(S2, new Date('2027-01-01T07:00:00Z'))).toBe(true);
  });
  it('shows only this semester (plus the certification sandbox) unless All classes is on', () => {
    const list = [
      base,
      { ...base, id: '2', course_code: 'GEOMETRY', name: 'Geometry', term: S2 }, // next semester (already published)
      { ...base, id: '3', course_code: 'PD', name: 'Educational Technology', term: PD },
      { ...base, id: '4', course_code: 'RQ', name: 'RaiderQuest 2025', term: ACT },
      { ...base, id: '5', course_code: 'DEMO', name: 'Demo', term: DEF },
      { ...base, id: '17272', course_code: 'RJ TASKS REVIEW', name: 'RJ Tasks Review', term: DEF },
      { ...base, id: '6', course_code: 'NOTERM', name: 'No term' , term: undefined },
    ];
    expect(teacherCourses(list, NOW).map((c) => c.id)).toEqual(['1', '17272']);
    expect(teacherCourses(list, NOW, [], true).map((c) => c.id).sort()).toEqual(['1', '17272', '2', '3', '4', '5', '6']);
    expect(isShownCourse({ ...base, enrollments: [{ type: 'student' }] }, NOW)).toBe(false);
    expect(isShownCourse({ ...base, workflow_state: 'unpublished' }, NOW)).toBe(false);
    // a course with its own enforced end date past the term's end
    const late = new Date(2027, 0, 10);
    expect(isShownCourse({ ...base, restrict_enrollments_to_course_dates: true, end_at: '2027-01-20T06:00:00Z' }, late)).toBe(true);
    expect(isShownCourse(base, late)).toBe(false);
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
  const run = (list: CanvasAssignment[], course = ALG, g = course.weighted ? groups : []) =>
    runCheckup(course, list, g, NOW).map((i) => `${i.rule}:${i.key.split(':')[2]}`);

  it('flags a published graded assignment with no due date anywhere', () => {
    expect(run([a({ id: '1', due_at: null })], GEO)).toEqual(['no_due_date:1']);
    // a section override date counts as a due date
    expect(
      run([a({ id: '2', due_at: null, all_dates: [{ base: true, due_at: null }, { due_at: at(27), set_type: 'CourseSection', title: 'P3' }] })], GEO)
    ).toEqual([]);
    // not graded, or unpublished: no flag
    expect(run([a({ id: '3', due_at: null, grading_type: 'not_graded' }), a({ id: '4', due_at: null, published: false })], GEO)).toEqual([]);
    // Roll Call attendance is undated by design
    expect(run([a({ id: '5', due_at: null, name: 'Roll Call Attendance' })], GEO)).toEqual([]);
  });

  it('flags unpublished work due within 3 days or in the last 2 weeks', () => {
    expect(run([a({ id: '1', published: false, due_at: at(24) })], GEO)).toEqual(['unpublished_due:1']);
    expect(run([a({ id: '2', published: false, due_at: at(20) })], GEO)).toEqual(['unpublished_due:2']);
    expect(run([a({ id: '3', published: false, due_at: at(30) })], GEO)).toEqual([]); // far future: on purpose
    expect(run([a({ id: '4', published: false, due_at: at(1) })], GEO)).toEqual([]); // old leftover
  });

  it('flags a lock date before the due date, naming the section', () => {
    expect(run([a({ id: '1', due_at: at(26), lock_at: at(26, 15, 0) })], GEO)).toEqual(['locks_before_due:1']);
    const r = runCheckup(GEO, [a({ id: '3', due_at: null, all_dates: [{ title: 'Period 3', due_at: at(26), lock_at: at(26, 15, 0) }] })], [], NOW);
    expect(r[0].detail).toContain('for Period 3');
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
    expect(r.find((i) => i.rule === 'weights_total')!.detail).toContain('90%, not 100%. Canvas scales them up');
    const over = runCheckup(ALG, [], [{ id: 'g1', name: 'A', group_weight: 60 }, { id: 'g2', name: 'B', group_weight: 50 }], NOW);
    expect(over[0].detail).toContain("110%, more than 100%. Canvas doesn't scale them down");
    // three groups at 33.33% are close enough to 100
    expect(runCheckup(ALG, [], [1, 2, 3].map((i) => ({ id: `g${i}`, name: 'x', group_weight: 33.33 })), NOW)).toEqual([]);
    // unweighted course: the weights are ignored by Canvas, which is its own (new) flag
    expect(runCheckup(GEO, [a({ id: '1', assignment_group_id: 'g3' })], groups, NOW).map((i) => [i.rule, i.severity])).toEqual([['weights_off', 'check']]);
    // exact 100: fine
    expect(runCheckup(ALG, [], [{ id: 'g1', name: 'All', group_weight: 100 }], NOW)).toEqual([]);
  });

  // ---------- added in 1.1 ----------
  const SEM: TeacherCourse = { ...GEO, termStart: new Date(2026, 6, 11).getTime(), termEnd: new Date(2027, 0, 1).getTime() };
  const rules = (r: ReturnType<typeof runCheckup>) => r.map((i) => `${i.rule}:${i.severity}`).sort();
  // NOW is Thu Oct 22 2026; graded items due this week (Oct 19-25) and next (Oct 26-Nov 1) keep the weekly rule quiet
  const weekly = [a({ id: '900', name: 'This week', due_at: at(23) }), a({ id: '901', name: 'Next week', due_at: at(28) })];

  it('flags due dates outside the semester (left over from copying a course)', () => {
    const r = runCheckup(SEM, [...weekly, a({ id: '1', due_at: new Date(2025, 9, 20, 23, 59).toISOString() })], [], NOW);
    expect(rules(r)).toEqual(['outside_term:fix']);
    expect(r[0].detail).toContain('Oct 20, 2025');
    expect(rules(runCheckup(SEM, [...weekly, a({ id: '2', due_at: at(30) })], [], NOW))).toEqual([]);
    // one student's incomplete, due after the term: fine
    const inc = a({ id: '3', due_at: at(23), all_dates: [{ base: true, due_at: at(23) }, { due_at: new Date(2027, 0, 15).toISOString(), set_type: 'ADHOC', title: '1 student' }] });
    expect(rules(runCheckup(SEM, [...weekly, inc], [], NOW))).toEqual([]);
    // a course whose own (enforced) end date runs past the term uses that date
    const LATE: TeacherCourse = { ...SEM, termEnd: new Date(2027, 0, 31).getTime() };
    expect(rules(runCheckup(LATE, [...weekly, a({ id: '4', due_at: new Date(2027, 0, 20, 23, 59).toISOString() })], [], NOW))).toEqual([]);
    expect(rules(runCheckup(GEO, [a({ id: '1', due_at: '2025-10-20T05:59:00Z' })], [], NOW))).toEqual([]); // no term dates: skip
  });

  it('flags an assignment that opens after it is due', () => {
    expect(run([a({ id: '1', due_at: at(26), unlock_at: at(27) })], GEO)).toEqual(['opens_after_due:1']);
    expect(run([a({ id: '2', due_at: at(26), unlock_at: at(25) })], GEO)).toEqual([]);
  });

  it('flags upcoming weekend due dates (12:00 AM Monday counts as Sunday night)', () => {
    expect(run([a({ id: '1', due_at: at(25) })], GEO)).toEqual(['weekend_due:1']); // Sunday 11:59 PM
    expect(run([a({ id: '2', due_at: at(26, 0, 0) })], GEO)).toEqual(['midnight_due:2']); // one item, not two
    expect(run([a({ id: '3', due_at: at(23) })], GEO)).toEqual([]); // Friday
    expect(run([a({ id: '4', due_at: at(18) })], GEO)).toEqual([]); // past
    // one student's extension onto a Saturday is fine
    expect(run([a({ id: '5', due_at: at(23), all_dates: [{ base: true, due_at: at(23) }, { due_at: at(24), set_type: 'ADHOC', title: '1 student' }] })], GEO)).toEqual([]);
  });

  it('flags rubric totals that differ from the points (fix when the rubric grades)', () => {
    const r = runCheckup(GEO, [
      a({ id: '1', points_possible: 25, rubric_settings: { points_possible: 20 }, use_rubric_for_grading: true }),
      a({ id: '2', points_possible: 25, rubric_settings: { points_possible: 20 } }),
      a({ id: '3', points_possible: 20, rubric_settings: { points_possible: 20 } }),
    ], [], NOW);
    expect(r.map((i) => `${i.rule}:${i.severity}:${i.title}`)).toEqual(['rubric_points:fix:Assignment 1', 'rubric_points:check:Assignment 2']);
    expect(r[0].detail).toContain('adds up to 20 points but the assignment is worth 25');
  });

  it('flags weights that are set but turned off (worth a look: may be leftovers)', () => {
    const r = runCheckup(GEO, [], [{ id: 'g1', name: 'Homework', group_weight: 40 }, { id: 'g2', name: 'Tests', group_weight: 60 }], NOW);
    expect(rules(r)).toEqual(['weights_off:check']);
    expect(r[0].detail).toContain('Homework 40%, Tests 60%');
    expect(runCheckup(GEO, [], [{ id: 'g1', name: 'A', group_weight: 0 }, { id: 'g2', name: 'B', group_weight: 0 }], NOW)).toEqual([]);
  });

  it('flags a points typo (5x the rest of its group)', () => {
    const list = [10, 10, 12, 10, 1000].map((p, i) => a({ id: String(i + 1), points_possible: p, due_at: null, name: `HW ${i}` }));
    const r = runCheckup(GEO, list, [{ id: 'g1', name: 'Homework', group_weight: 0 }], NOW).filter((i) => i.rule === 'points_typo');
    expect(r.map((i) => i.title)).toEqual(['HW 4']);
    expect(r[0].detail).toContain('about 10');
  });

  it('flags graded work set not to count toward the final grade', () => {
    expect(run([a({ id: '1', omit_from_final_grade: true })], GEO)).toEqual(['omitted:1']);
    expect(run([a({ id: '2', omit_from_final_grade: true, points_possible: 0 })], GEO)).toEqual([]);
  });

  it('flags two published assignments with the same name, once', () => {
    expect(run([a({ id: '7', name: 'Lab 2' }), a({ id: '5', name: ' lab  2 ' }), a({ id: '6', name: 'Lab 2', published: false, due_at: null })], GEO)).toEqual(['duplicate_name:5']);
  });

  it('RJ Baseline 1: published assignments not reachable from Modules', () => {
    const list = [
      a({ id: '1', name: 'In a module' }),
      a({ id: '2', name: 'Classic quiz', quiz_id: '77' }),
      a({ id: '3', name: 'Graded discussion', discussion_topic: { id: '88' } }),
      a({ id: '4', name: 'Loose essay' }),
      a({ id: '5', name: 'In an unpublished module' }),
      a({ id: '6', name: 'Unpublished item' }),
      a({ id: '7', name: 'Draft', published: false }),
    ];
    const modules = [
      { id: 'm1', published: true, items: [
        { id: 'i1', type: 'Assignment', content_id: '1' },
        { id: 'i2', type: 'Quiz', content_id: '77' },
        { id: 'i3', type: 'Discussion', content_id: '88' },
        { id: 'i4', type: 'Assignment', content_id: '6', published: false },
      ] },
      { id: 'm2', published: false, items: [{ id: 'i5', type: 'Assignment', content_id: '5' }] },
    ];
    const r = runCheckup(GEO, list, [], NOW, { modules }).filter((i) => i.rule === 'not_in_module');
    expect(r).toHaveLength(1);
    expect(r[0].title).toBe('3 assignments not in Modules');
    expect(r[0].detail).toContain('Loose essay; In an unpublished module; Unpublished item');
    expect(r[0].link).toEqual({ kind: 'modules' });
    // Ignore covers exactly this set: a new loose assignment gets a new key
    const more = runCheckup(GEO, [...list, a({ id: '8', name: 'New essay' })], [], NOW, { modules }).find((i) => i.rule === 'not_in_module')!;
    expect(more.key).not.toBe(r[0].key);
    expect(more.key).toMatch(/^\d{1,20}:not_in_module:\d{1,20}$/);
    // couldn't read modules: skipped, not guessed
    expect(runCheckup(GEO, list, [], NOW, { modules: null }).some((i) => i.rule === 'not_in_module')).toBe(false);
  });

  it('RJ Baseline 2 and 3: missing policy off, grading waiting 7+ days', () => {
    const r = runCheckup(GEO, [], [], NOW, { missingPolicyOn: false, waiting7: 4 });
    expect(rules(r)).toEqual(['grading_waiting:fix', 'missing_policy:fix']);
    // ignoring "waiting 7+ days" lasts for this week only
    expect(r.find((i) => i.rule === 'grading_waiting')!.key).toBe('2:grading_waiting:20261019');
    expect(runCheckup(GEO, [], [], NOW, { missingPolicyOn: true, waiting7: 0 })).toEqual([]);
    expect(runCheckup(GEO, [], [], NOW, { missingPolicyOn: null, waiting7: null })).toEqual([]);
  });

  it('RJ Baseline 3: a graded item due this week (Mon–Thu) and next week', () => {
    // the class has graded work before (so it has started), none this week or next
    const earlier = a({ id: '800', name: 'Earlier', due_at: at(9) });
    expect(rules(runCheckup(SEM, [earlier], [], NOW))).toEqual(['weekly_graded:check', 'weekly_graded:fix']); // Thursday: still time
    expect(rules(runCheckup(SEM, [earlier], [], new Date(2026, 9, 23, 9)))).toEqual(['weekly_graded:check']); // Friday: only next week
    const mon = new Date(2026, 9, 19, 9);
    expect(runCheckup(SEM, [earlier, ...weekly], [], mon)).toEqual([]);
    // an extension for one student doesn't count as the week's graded item
    const ext = a({ id: '9', due_at: null, all_dates: [{ due_at: at(28), set_type: 'ADHOC', title: '1 student' }] });
    expect(rules(runCheckup(SEM, [earlier, weekly[0], ext], [], mon))).toEqual(['weekly_graded:check']);
    // planned but not yet published counts (some teachers publish on the day)
    expect(rules(runCheckup(SEM, [earlier, weekly[0], a({ id: '10', due_at: at(28), published: false })], [], mon))).toEqual([]);
    // the week's key carries its date, so Ignore only hides that week
    expect(runCheckup(SEM, [earlier], [], NOW).map((i) => i.key)).toEqual(['2:weekly_graded:20261019', '2:weekly_graded:20261026']);
  });

  it('RJ Baseline 3 stays quiet in summer and break weeks', () => {
    const july = new Date(2026, 6, 21, 9); // term has started, school hasn't
    const first = a({ id: '1', due_at: new Date(2026, 7, 20, 23, 59).toISOString() });
    expect(runCheckup(SEM, [first], [], july)).toEqual([]);
    // Thanksgiving: nothing due anywhere that week, so it's a break
    const thanksMon = new Date(2026, 10, 23, 9);
    const before = a({ id: '2', due_at: new Date(2026, 10, 20, 23, 59).toISOString() });
    const after = a({ id: '3', due_at: new Date(2026, 11, 4, 23, 59).toISOString() });
    const activeWeeks = activeWeeksOf([[before, after]]);
    expect(rules(runCheckup(SEM, [before, after], [], thanksMon, { activeWeeks }))).toEqual([]); // and next week has graded work
    // ...but if another class has work due Thanksgiving week, it isn't a break
    const other = a({ id: '4', due_at: new Date(2026, 10, 24, 23, 59).toISOString() });
    expect(rules(runCheckup(SEM, [before, after], [], thanksMon, { activeWeeks: activeWeeksOf([[before, after], [other]]) }))).toEqual(['weekly_graded:fix']);
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
    // auto-graded missing work (Canvas's missing-submission policy) still counts
    const graded = buildStudents(ALG, users, [miss('u2', '1', { workflow_state: 'graded', grade: '0' }), miss('u2', '2')], assignments, 2);
    expect(graded.map((r) => r.missing.length)).toEqual([2]);
    // the student's own due date wins over the assignment's
    const own = buildStudents(ALG, users, [miss('u1', '1', { cached_due_date: at(7) })], assignments, 1);
    expect(own[0].missing[0].dueAt?.toISOString()).toBe(at(7));
    expect(buildStudents(ALG, users, [miss('u1', '1')], assignments, 3)).toEqual([]);
  });

  it('copies as plain text grouped by class', () => {
    const rows = buildStudents(ALG, users, [miss('u1', '1'), miss('u1', '2')], assignments, 1);
    expect(studentsAsText(rows)).toBe('ALGEBRA 1 · Algebra 1\nAvery Cole (2 missing): HW 1; HW 2');
  });

  it('chunks assignment ids', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe('your week', () => {
  it('lists the next 7 days and flags 3+ graded items for one class on a day, not 2', () => {
    const days = buildWeek(
      [
        {
          course: ALG,
          assignments: [
            a({ id: '1', name: 'Quiz', due_at: at(23, 8, 0) }),
            a({ id: '2', name: 'HW', due_at: at(23) }),
            a({ id: '9', name: 'Reading', due_at: at(23) }),
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
    expect(fri.items.map((i) => i.name)).toEqual(['Quiz', 'HW', 'Practice', 'Reading']);
    expect(fri.flags).toEqual([{ course: ALG, forWhom: null, count: 3 }]);
    const sat = days[2];
    expect(sat.items.map((i) => i.name)).toEqual(['Lab']);
    const mon = days[4];
    expect(mon.items.map((i) => `${i.name}/${i.forWhom}`)).toEqual(['Lab/Period 3', 'Test/Period 3']);
    expect(mon.flags).toEqual([]); // two is ordinary homework
  });

  it('counts whole-class dates toward a section, and never counts individual extensions', () => {
    const days = buildWeek(
      [
        {
          course: GEO,
          assignments: [
            a({ id: '1', name: 'Quiz', due_at: at(23) }),
            a({ id: '5', name: 'HW', due_at: at(23) }),
            a({ id: '2', name: 'Test', due_at: null, all_dates: [{ title: 'Period 5', set_type: 'CourseSection', due_at: at(23) }] }),
            a({ id: '3', name: 'Lab', due_at: at(28), all_dates: [{ base: true, due_at: at(28) }, { title: '1 student', set_type: 'ADHOC', due_at: at(23) }] }),
            a({ id: '4', name: 'Essay', due_at: at(28), all_dates: [{ base: true, due_at: at(28) }, { title: '2 students', due_at: at(23) }] }),
          ],
        },
      ],
      NOW
    );
    const fri = days[1];
    expect(fri.items.map((i) => `${i.name}/${i.scope}`).sort()).toEqual(['Essay/some', 'HW/all', 'Lab/some', 'Quiz/all', 'Test/section']);
    expect(fri.flags).toEqual([{ course: GEO, forWhom: null, count: 2 }, { course: GEO, forWhom: 'Period 5', count: 3 }].filter((f) => f.count >= 3));
  });
});

describe('grading coming in (forecast)', () => {
  it('counts students per due date for work the teacher grades, over 14 days', () => {
    const days = buildForecast(
      [
        {
          course: ALG,
          students: 24,
          assignments: [
            a({ id: '1', due_at: at(23) }), // Fri
            a({ id: '2', due_at: at(23), submission_types: ['online_quiz'] }), // Canvas grades it
            a({ id: '3', due_at: at(23), submission_types: ['external_tool'] }), // New Quiz / tool
            a({ id: '4', due_at: at(27), points_possible: 0 }), // nothing to grade
            a({ id: '5', due_at: at(27), published: false }),
            a({ id: '6', due_at: at(21) }), // already due
            a({ id: '7', due_at: at(30), submission_types: ['on_paper'] }), // paper still needs grading
          ],
        },
        {
          course: GEO,
          students: 20,
          assignments: [
            // two sections with different dates: the class is split across them
            a({ id: '8', due_at: null, all_dates: [{ due_at: at(26), set_type: 'CourseSection', title: 'P1' }, { due_at: at(27), set_type: 'CourseSection', title: 'P3' }] }),
            // a one-student extension adds nothing
            a({ id: '9', due_at: null, all_dates: [{ due_at: at(28), set_type: 'ADHOC', title: '1 student' }] }),
          ],
        },
      ],
      NOW
    );
    expect(days).toHaveLength(14);
    const by = Object.fromEntries(days.filter((d) => d.total).map((d) => [d.date.getDate(), d.total]));
    expect(by).toEqual({ 23: 24, 26: 10, 27: 10, 30: 24 });
    expect(days.find((d) => d.date.getDate() === 23)!.byCourse[0].items).toEqual(['Assignment 1']);
  });
  it('knows which work the teacher grades', () => {
    expect(needsTeacherGrading(a({ id: '1', submission_types: ['online_upload'] }))).toBe(true);
    expect(needsTeacherGrading(a({ id: '2', submission_types: ['online_quiz'] }))).toBe(false);
    expect(needsTeacherGrading(a({ id: '3', grading_type: 'not_graded' }))).toBe(false);
  });
});

describe('grading waiting 7+ days', () => {
  it('counts each student once, graded assignments only, not excused', () => {
    const cutoff = new Date(2026, 9, 15);
    const list = [a({ id: '10' }), a({ id: '11', grading_type: 'not_graded' })];
    const s = (o: Partial<CanvasSubmission>): CanvasSubmission => ({ assignment_id: '10', user_id: 'u1', workflow_state: 'submitted', submitted_at: new Date(2026, 9, 10).toISOString(), ...o });
    expect(
      countWaiting(list, [
        s({}),
        s({}), // same student twice
        s({ user_id: 'u2', submitted_at: new Date(2026, 9, 20).toISOString() }), // recent
        s({ user_id: 'u3', excused: true }),
        s({ user_id: 'u4', assignment_id: '11' }), // not graded
        s({ user_id: 'u5', workflow_state: 'graded' }),
        s({ user_id: 'u6', workflow_state: 'pending_review' }),
      ], cutoff)
    ).toBe(2);
  });
});

describe('settings (1.1)', () => {
  it('keeps a valid section order and repairs a damaged one', () => {
    expect(normalizeOrder(['week', 'students', 'grade', 'checkup'])).toEqual(['week', 'students', 'grade', 'checkup']);
    expect(normalizeOrder(['week', 'week', 'bogus'])).toEqual(['week', 'grade', 'checkup', 'students']);
    expect(normalizeOrder(undefined)).toEqual(['grade', 'checkup', 'students', 'week']);
  });
  it('defaults: this semester only, nothing hidden, every check on', () => {
    const d = clean({});
    expect(d.allClasses).toBe(false);
    expect(d.cardHidden).toEqual([]);
    expect(d.cardCollapsed).toBe(false);
    expect(d.checksOff).toEqual([]);
    expect(clean({ cardHidden: ['week', 'x', 'grade'], checksOff: ['weekend_due', 3, '<b>'] })).toMatchObject({ cardHidden: ['grade', 'week'], checksOff: ['weekend_due'] });
  });
});

import { vi } from 'vitest';
import { Loader } from '../src/data/loader';
import { TeacherCourse } from '../src/lib/types';

const NOW = new Date(2026, 9, 22, 10, 0, 0);
const C: TeacherCourse = { id: '7', name: 'Algebra 1', code: 'ALGEBRA 1', weighted: false };
const past = new Date(2026, 9, 20, 23, 59).toISOString();

function route(map: Record<string, (u: URL) => unknown>) {
  const seen: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const u = new URL(String(input));
    seen.push(u.pathname + u.search);
    const key = Object.keys(map).find((k) => u.pathname.endsWith(k));
    const body = key ? map[key](u) : [];
    return { ok: true, status: 200, text: async () => JSON.stringify(body), headers: new Headers() } as unknown as Response;
  });
  return seen;
}

afterEach(() => vi.restoreAllMocks());

const users = [{ id: '1', name: 'Avery Cole' }, { id: '2', name: 'Blake Diaz' }];
const assignments = [
  { id: '10', name: 'HW', published: true, due_at: past, points_possible: 10, grading_type: 'points', assignment_group_id: 'g' },
  { id: '11', name: 'Quiz', published: true, due_at: past, points_possible: 10, grading_type: 'points', assignment_group_id: 'g' },
];

describe('Loader', () => {
  it('Students asks for every state (so auto-graded Missing work counts) for active students only', async () => {
    const seen = route({
      '/assignments': () => assignments,
      '/users': () => users,
      '/grading_periods': () => ({ grading_periods: [] }),
      '/students/submissions': () => [
        { assignment_id: '10', user_id: '1', workflow_state: 'graded', missing: true, submitted_at: null },
        { assignment_id: '11', user_id: '1', workflow_state: 'unsubmitted', missing: true, submitted_at: null },
        { assignment_id: '10', user_id: '99', workflow_state: 'unsubmitted', missing: true, submitted_at: null },
      ],
    });
    const r = await new Loader(() => NOW).students([C], 2);
    expect(r.value.map((s) => [s.name, s.missing.length])).toEqual([['Avery Cole', 2]]);
    expect(r.periodKnown).toBe(false);
    const q = seen.find((s) => s.includes('/students/submissions'))!;
    expect(q).not.toContain('workflow_state');
    expect(q).toContain('enrollment_state=active');
    expect(q).toContain('assignment_ids[]=10');
  });

  it('Students counts a 0 typed in for online work never turned in (Canvas drops Missing then)', async () => {
    const online = assignments.map((a) => ({ ...a, submission_types: ['online_upload'] }));
    route({
      '/assignments': () => online,
      '/users': () => users,
      '/grading_periods': () => ({ grading_periods: [] }),
      '/students/submissions': () => [
        { assignment_id: '10', user_id: '2', workflow_state: 'graded', missing: false, submitted_at: null, score: 0, grade: '0' },
        { assignment_id: '11', user_id: '2', workflow_state: 'graded', missing: false, submitted_at: null, score: 0, grade: '0' },
        // turned in and scored 0: a real score, not missing
        { assignment_id: '10', user_id: '1', workflow_state: 'graded', missing: false, submitted_at: past, score: 0, grade: '0' },
      ],
    });
    const r = await new Loader(() => NOW).students([C], 2);
    expect(r.value.map((s) => [s.name, s.missing.length])).toEqual([['Blake Diaz', 2]]);
  });

  it('To grade leaves out submissions from students who are not active (dropped, Test Student)', async () => {
    route({
      '/assignments': () => assignments,
      '/users': () => users,
      '/students/submissions': (u) =>
        u.searchParams.get('workflow_state') === 'submitted'
          ? [
              { assignment_id: '10', user_id: '1', workflow_state: 'submitted', submitted_at: past },
              { assignment_id: '10', user_id: '42', workflow_state: 'submitted', submitted_at: past },
            ]
          : [],
    });
    const r = await new Loader(() => NOW).toGrade([C]);
    expect(r.value.map((x) => x.count)).toEqual([1]);
  });

  it('reuses data between tab switches instead of downloading again', async () => {
    const seen = route({ '/assignments': () => assignments, '/users': () => users, '/grading_periods': () => ({}), '/students/submissions': () => [] });
    const l = new Loader(() => NOW);
    await l.students([C], 1);
    const n = seen.length;
    await l.students([C], 3);
    await l.week([C]);
    expect(seen.length).toBe(n);
  });
});

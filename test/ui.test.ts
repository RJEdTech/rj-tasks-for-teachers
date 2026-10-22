import { h, safeLink } from '../src/ui/dom';
import { checkupView, gradingView, studentsView, weekView } from '../src/ui/views';
import { clean, DEFAULTS } from '../src/lib/settings';
import { courseIdFromPath, isGradingPage } from '../src/content';
import { StudentRow } from '../src/data/students';
import { GradingRow } from '../src/data/grading';
import { Issue } from '../src/data/checkup';
import { buildWeek } from '../src/data/week';
import { TeacherCourse } from '../src/lib/types';

const NOW = new Date(2026, 9, 22, 10, 0, 0);
const C: TeacherCourse = { id: '7', name: 'Algebra 1', code: 'ALGEBRA 1', weighted: false };
const EVIL = '<img src=x onerror="alert(1)">';

describe('dom helper', () => {
  it('puts text in as text, never HTML', () => {
    const el = h('div', {}, EVIL);
    expect(el.textContent).toBe(EVIL);
    expect(el.querySelector('img')).toBeNull();
  });
  it('refuses event-handler and style attributes', () => {
    expect(() => h('div', { onclick: 'x()' })).toThrow();
    expect(() => h('div', { style: 'color:red' })).toThrow();
    expect(() => h('a', { srcdoc: 'x' })).toThrow();
  });
  it('only links to this Canvas site', () => {
    expect(safeLink('javascript:alert(1)')).toBe('#');
    expect(safeLink('https://evil.example/')).toBe('#');
    expect(safeLink('data:text/html,hi')).toBe('#');
    expect(safeLink('/courses/1')).toBe('https://rjhs.instructure.com/courses/1');
    expect(h('a', { href: 'javascript:alert(1)' }).getAttribute('href')).toBe('#');
  });
});

describe('views', () => {
  it('To grade links straight to SpeedGrader and marks old waits', () => {
    const rows: GradingRow[] = [
      { course: C, assignmentId: '42', name: EVIL, count: 5, late: 2, resubmitted: 1, review: 0, oldest: new Date(2026, 9, 10), dueAt: null },
    ];
    const el = gradingView(rows, true, NOW);
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain(EVIL);
    expect(el.textContent).toContain('5 submissions to grade in 1 assignment');
    expect(el.textContent).toContain('2 late');
    expect(el.textContent).toContain('oldest waiting 12 days');
    expect(el.querySelector('a')!.getAttribute('href')).toBe(
      'https://rjhs.instructure.com/courses/7/gradebook/speed_grader?assignment_id=42'
    );
    expect(el.querySelector('.row.old')).not.toBeNull();
  });

  it('empty To grade says so', () => {
    expect(gradingView([], true, NOW).textContent).toContain('Nothing is waiting');
  });

  it('Check-up links to the edit page and Ignore calls back', () => {
    const issue: Issue = {
      key: '7:no_due_date:42', course: C, rule: 'no_due_date', severity: 'fix', title: 'Lab 2', detail: 'No due date',
      link: { kind: 'assignment_edit', assignmentId: '42' }, sortDate: 0,
    };
    let ignored: Issue | null = null;
    const el = checkupView([issue], 2, false, (i) => (ignored = i), () => undefined);
    expect(el.querySelector('a')!.getAttribute('href')).toBe('https://rjhs.instructure.com/courses/7/assignments/42/edit');
    (Array.from(el.querySelectorAll('button')).find((b) => b.textContent === 'Ignore') as HTMLButtonElement).click();
    expect(ignored).toBe(issue);
    expect(el.textContent).toContain('2 items ignored');
  });

  const rows: StudentRow[] = [
    { course: C, userId: '900', name: 'Avery Cole', sortableName: 'Cole, Avery', missing: [{ assignmentId: '1', name: 'HW 1', dueAt: NOW }, { assignmentId: '2', name: 'HW 2', dueAt: null }, { assignmentId: '3', name: 'HW 3', dueAt: null }] },
  ];
  const base = {
    rows, courses: [C], threshold: 3, showCourse: true,
    onShowNames: () => undefined, onHideNames: () => undefined, onCopy: () => undefined, onThreshold: () => undefined,
  };

  it('Students hides names until asked', () => {
    const hidden = studentsView({ ...base, namesShown: false });
    expect(hidden.textContent).not.toContain('Avery');
    expect(hidden.textContent).toContain('ALGEBRA 1');
    expect(hidden.textContent).toContain('1 student');
    expect(hidden.textContent).toContain('Names are hidden');
  });

  it('Students shows names, missing work and a grades link when asked', () => {
    const shown = studentsView({ ...base, namesShown: true });
    expect(shown.textContent).toContain('Avery Cole');
    expect(shown.textContent).toContain('3 missing');
    expect(shown.textContent).toContain('HW 2');
    expect(shown.querySelector('a')!.getAttribute('href')).toBe('https://rjhs.instructure.com/courses/7/grades/900');
  });

  it('Week shows the 7 days, flags and the teachers-only note', () => {
    const days = buildWeek(
      [{ course: C, assignments: [
        { id: '1', name: 'Quiz', published: true, due_at: new Date(2026, 9, 23, 8).toISOString(), points_possible: 20, grading_type: 'points', assignment_group_id: null },
        { id: '2', name: 'HW', published: true, due_at: new Date(2026, 9, 23, 23, 59).toISOString(), points_possible: 10, grading_type: 'points', assignment_group_id: null },
      ] }],
      NOW
    );
    const el = weekView(days, true, NOW);
    expect(el.querySelectorAll('.day')).toHaveLength(7);
    expect(el.textContent).toContain('Tomorrow');
    expect(el.textContent).toContain('ALGEBRA 1: 2 graded items due this day');
    expect(el.textContent).toContain("Canvas doesn't let teachers see");
  });
});

describe('settings', () => {
  it('falls back to defaults for bad stored values', () => {
    expect(clean(undefined)).toEqual(DEFAULTS);
    expect(clean({ missingThreshold: 99, hideNames: 'no', excludedCourses: ['12', 'x', '<b>'], buttonOnGradingPages: 1 })).toEqual({
      ...DEFAULTS,
      excludedCourses: ['12'],
    });
    expect(clean({ missingThreshold: 2, hideNames: false })).toMatchObject({ missingThreshold: 2, hideNames: false });
  });
});

describe('page detection', () => {
  it('finds the course id', () => {
    expect(courseIdFromPath('/courses/123/assignments')).toBe('123');
    expect(courseIdFromPath('/courses/123')).toBe('123');
    expect(courseIdFromPath('/calendar')).toBeNull();
  });
  it('knows SpeedGrader and the Gradebook', () => {
    expect(isGradingPage('/courses/1/gradebook/speed_grader')).toBe(true);
    expect(isGradingPage('/courses/1/gradebook')).toBe(true);
    expect(isGradingPage('/courses/1/assignments')).toBe(false);
  });
});

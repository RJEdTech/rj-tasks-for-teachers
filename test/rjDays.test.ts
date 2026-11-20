import { dayColor, dayColorLine, nextSchoolDay } from '../src/lib/rjDays';

/* Dates are built in local time, the way the extension reads them. */
const at = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h);

describe('RJ Red/White days (2026-27, from the myRJ RED DAY / WHITE DAY calendars)', () => {
  test('matches the myRJ calendar for the week of Nov 16', () => {
    expect(dayColor(at(2026, 11, 16))).toBe('White');
    expect(dayColor(at(2026, 11, 17))).toBe('Red');
    expect(dayColor(at(2026, 11, 18))).toBe('White');
    expect(dayColor(at(2026, 11, 19))).toBe('Red'); // IMPACT day, still Red
    expect(dayColor(at(2026, 11, 20))).toBe('White');
  });

  test('first and last day of the year, and the semester restart', () => {
    expect(dayColor(at(2026, 8, 19))).toBe('Red');
    expect(dayColor(at(2027, 5, 24))).toBe('Red');
    expect(dayColor(at(2026, 12, 14))).toBe('Red');
    expect(dayColor(at(2027, 1, 5))).toBe('Red');
    expect(dayColor(at(2027, 1, 6))).toBe('White');
  });

  test('weekends, breaks, exams and testing days have no color', () => {
    expect(dayColor(at(2026, 11, 21))).toBeNull(); // Saturday
    expect(dayColor(at(2026, 11, 25))).toBeNull(); // Thanksgiving
    expect(dayColor(at(2026, 12, 16))).toBeNull(); // exams
    expect(dayColor(at(2027, 3, 16))).toBeNull();
    expect(dayColor(at(2027, 4, 15))).toBeNull();
    expect(dayColor(at(2027, 5, 12))).toBeNull();
    expect(dayColor(at(2027, 5, 26))).toBeNull();
  });

  test('late at night still reads the local day', () => {
    expect(dayColor(new Date(2026, 10, 17, 23, 59))).toBe('Red');
    expect(dayColor(new Date(2026, 10, 18, 0, 1))).toBe('White');
  });

  test('every listed day is a weekday, and colors alternate within a semester', () => {
    const days: Array<[Date, string]> = [];
    for (
      let d = at(2026, 8, 1);
      d < at(2027, 6, 30);
      d = at(d.getFullYear(), d.getMonth() + 1, d.getDate() + 1)
    ) {
      const c = dayColor(d);
      if (c) days.push([d, c]);
    }
    expect(days.length).toBe(162);
    expect(days.filter(([, c]) => c === 'Red').length).toBe(82);
    days.forEach(([d]) => expect([0, 6]).not.toContain(d.getDay()));
    const repeats = days
      .filter((d, i) => i > 0 && d[1] === days[i - 1][1])
      .map(([d]) => d.getTime());
    expect(repeats).toEqual([at(2027, 1, 5).getTime()]); // only the semester restart
  });

  test('next school day skips weekends and breaks', () => {
    expect(nextSchoolDay(at(2026, 11, 20))?.date.getDate()).toBe(30);
    expect(nextSchoolDay(at(2026, 12, 14))?.date).toEqual(at(2027, 1, 5, 0));
    expect(nextSchoolDay(at(2027, 5, 24))).toBeNull();
  });
});

describe('dayColorLine (what the panel says)', () => {
  test('a school day: today and tomorrow', () => {
    const l = dayColorLine(at(2026, 11, 17));
    expect(l?.today).toBe('Red');
    expect(l?.next?.label).toBe('Tomorrow');
    expect(l?.next?.color).toBe('White');
  });

  test('a Friday: names Monday', () => {
    const l = dayColorLine(at(2026, 11, 6));
    expect(l?.today).toBe('White');
    expect(l?.next?.label).toBe('Monday');
    expect(l?.next?.color).toBe('Red');
  });

  test('Thanksgiving weekend: no today, the date of the next school day', () => {
    const l = dayColorLine(at(2026, 11, 21));
    expect(l?.today).toBeNull();
    expect(l?.next?.label).toBe('Mon, Nov 30');
    expect(l?.next?.color).toBe('Red');
  });

  test('summer and after the table ends: nothing at all', () => {
    expect(dayColorLine(at(2027, 6, 15))).toBeNull();
    expect(dayColorLine(at(2027, 9, 1))).toBeNull();
  });
});

describe('teacher views', () => {
  it('the panel week labels each school day, and can leave it out', async () => {
    const { weekView } = await import('../src/ui/views');
    const { buildWeek } = await import('../src/data/week');
    const now = at(2026, 11, 16);
    const days = buildWeek([], now);
    const on = weekView(days, true, now).textContent ?? '';
    expect(on).toContain('Mon, Nov 16 · White Day');
    expect(on).toContain('Tue, Nov 17 · Red Day');
    expect(on).not.toContain('Sat, Nov 21 ·  Day');
    const off = weekView(days, true, now, false).textContent ?? '';
    expect(off).not.toMatch(/(Red|White) Day/);
  });

  it('settings: on by default, and a saved choice is kept', async () => {
    const { clean } = await import('../src/lib/settings');
    expect(clean({}).showDayColor).toBe(true);
    expect(clean({ showDayColor: false }).showDayColor).toBe(false);
    expect(clean({ showDayColor: 'no' }).showDayColor).toBe(true);
  });
});

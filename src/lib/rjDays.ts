/*
  RJ Red/White days, 2026-27.

  Read on Nov 20, 2026 from the RED DAY and WHITE DAY school calendars in
  myRJ (Calendar > School Calendars). 82 Red days and 80 White days, Aug 19,
  2026 to May 24, 2027. The rotation restarts with a Red day each semester,
  so Dec 14 and Jan 5 are both Red.

  A date that isn't listed has no color: weekends, breaks, exam days,
  retreats and testing days. After the last listed day nothing shows at all,
  so an old table goes quiet instead of showing a wrong color.

  Nothing here is fetched: the table ships inside the extension, so it needs
  no permissions and sends nothing anywhere. To make next year's table, see
  tools/rj-days/README.md. This file is the same in RJ Tasks for Students
  and RJ Tasks for Teachers.
*/

export type DayColor = 'Red' | 'White';

export const RJ_DAYS_YEAR = '2026-27';

const RED_DAYS: string[] = [
  '2026-08-19',
  '2026-08-21',
  '2026-08-25',
  '2026-08-27',
  '2026-08-31',
  '2026-09-02',
  '2026-09-04',
  '2026-09-09',
  '2026-09-11',
  '2026-09-15',
  '2026-09-17',
  '2026-09-21',
  '2026-09-23',
  '2026-09-25',
  '2026-09-29',
  '2026-10-01',
  '2026-10-06',
  '2026-10-08',
  '2026-10-12',
  '2026-10-20',
  '2026-10-22',
  '2026-10-26',
  '2026-10-28',
  '2026-10-30',
  '2026-11-03',
  '2026-11-05',
  '2026-11-09',
  '2026-11-11',
  '2026-11-13',
  '2026-11-17',
  '2026-11-19',
  '2026-11-30',
  '2026-12-02',
  '2026-12-04',
  '2026-12-08',
  '2026-12-10',
  '2026-12-14',
  '2027-01-05',
  '2027-01-07',
  '2027-01-11',
  '2027-01-13',
  '2027-01-15',
  '2027-01-20',
  '2027-01-22',
  '2027-01-26',
  '2027-01-28',
  '2027-02-01',
  '2027-02-03',
  '2027-02-05',
  '2027-02-09',
  '2027-02-11',
  '2027-02-16',
  '2027-02-18',
  '2027-02-22',
  '2027-02-24',
  '2027-02-26',
  '2027-03-02',
  '2027-03-04',
  '2027-03-08',
  '2027-03-10',
  '2027-03-12',
  '2027-03-17',
  '2027-03-19',
  '2027-03-31',
  '2027-04-02',
  '2027-04-06',
  '2027-04-08',
  '2027-04-12',
  '2027-04-14',
  '2027-04-19',
  '2027-04-21',
  '2027-04-23',
  '2027-04-27',
  '2027-04-29',
  '2027-05-03',
  '2027-05-05',
  '2027-05-07',
  '2027-05-11',
  '2027-05-14',
  '2027-05-18',
  '2027-05-20',
  '2027-05-24',
];

const WHITE_DAYS: string[] = [
  '2026-08-20',
  '2026-08-24',
  '2026-08-26',
  '2026-08-28',
  '2026-09-01',
  '2026-09-03',
  '2026-09-08',
  '2026-09-10',
  '2026-09-14',
  '2026-09-16',
  '2026-09-18',
  '2026-09-22',
  '2026-09-24',
  '2026-09-28',
  '2026-09-30',
  '2026-10-05',
  '2026-10-07',
  '2026-10-09',
  '2026-10-13',
  '2026-10-21',
  '2026-10-23',
  '2026-10-27',
  '2026-10-29',
  '2026-11-02',
  '2026-11-04',
  '2026-11-06',
  '2026-11-10',
  '2026-11-12',
  '2026-11-16',
  '2026-11-18',
  '2026-11-20',
  '2026-12-01',
  '2026-12-03',
  '2026-12-07',
  '2026-12-09',
  '2026-12-11',
  '2027-01-06',
  '2027-01-08',
  '2027-01-12',
  '2027-01-14',
  '2027-01-19',
  '2027-01-21',
  '2027-01-25',
  '2027-01-27',
  '2027-01-29',
  '2027-02-02',
  '2027-02-04',
  '2027-02-08',
  '2027-02-10',
  '2027-02-12',
  '2027-02-17',
  '2027-02-19',
  '2027-02-23',
  '2027-02-25',
  '2027-03-01',
  '2027-03-03',
  '2027-03-05',
  '2027-03-09',
  '2027-03-11',
  '2027-03-15',
  '2027-03-18',
  '2027-03-30',
  '2027-04-01',
  '2027-04-05',
  '2027-04-07',
  '2027-04-09',
  '2027-04-13',
  '2027-04-16',
  '2027-04-20',
  '2027-04-22',
  '2027-04-26',
  '2027-04-28',
  '2027-04-30',
  '2027-05-04',
  '2027-05-06',
  '2027-05-10',
  '2027-05-13',
  '2027-05-17',
  '2027-05-19',
  '2027-05-21',
];

const COLOR = new Map<string, DayColor>();
RED_DAYS.forEach((d) => COLOR.set(d, 'Red'));
WHITE_DAYS.forEach((d) => COLOR.set(d, 'White'));

/* YYYY-MM-DD in local time (the laptop's time zone, which is RJ's). */
export function localKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/* Red or White for that calendar day, or null when it has no color. */
export function dayColor(d: Date): DayColor | null {
  return COLOR.get(localKey(d)) ?? null;
}

export interface SchoolDay {
  date: Date;
  color: DayColor;
}

/* The first colored day after `d`, looking up to `maxDays` ahead (covers winter break). */
export function nextSchoolDay(d: Date, maxDays = 31): SchoolDay | null {
  for (let i = 1; i <= maxDays; i++) {
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i);
    const color = dayColor(next);
    if (color) return { date: next, color };
  }
  return null;
}

export interface DayColorLine {
  today: DayColor | null;
  next: (SchoolDay & { label: string }) | null;
}

/* What to say at the top of the panel or card: today's color, and the next
   school day's ("Tomorrow", "Monday", or "Tue, Jan 5" when it's more than a
   week away). Null when there is nothing to say (summer, or past the table). */
export function dayColorLine(now: Date = new Date()): DayColorLine | null {
  const today = dayColor(now);
  const n = nextSchoolDay(now);
  if (!today && !n) return null;
  let next: DayColorLine['next'] = null;
  if (n) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const away = Math.round((n.date.getTime() - start.getTime()) / 86400000);
    const label =
      away === 1
        ? 'Tomorrow'
        : away < 7
        ? n.date.toLocaleDateString('en-US', { weekday: 'long' })
        : n.date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          });
    next = { ...n, label };
  }
  return { today, next };
}

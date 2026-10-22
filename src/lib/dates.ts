/* Date helpers. All "day" logic uses the teacher's own time zone (the laptop's). */

export function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* YYYY-MM-DD in local time. */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/* Exactly 12:00:00 AM local time — the "due at midnight" trap. */
export function isLocalMidnight(d: Date): boolean {
  return d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0;
}

const dayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

export function formatDay(d: Date): string {
  return dayFmt.format(d);
}

export function formatDayTime(d: Date): string {
  return `${dayFmt.format(d)}, ${timeFmt.format(d)}`;
}

/* "today", "1 day", "6 days" — how long something has been waiting. */
export function waitingFor(since: Date, now: Date): string {
  const days = Math.floor((startOfDay(now).getTime() - startOfDay(since).getTime()) / 86400000);
  if (days <= 0) return 'today';
  return days === 1 ? '1 day' : `${days} days`;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);
}

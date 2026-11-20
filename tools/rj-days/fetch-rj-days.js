/*
  Prints the RED_DAYS and WHITE_DAYS lists for src/.../rjDays.ts.

  1. Sign in to myRJ and open Calendar.
  2. Press F12, open Console, paste this whole file, press Enter.
  3. Change START and END below first if it's a new school year.
  4. Copy what it prints into rjDays.ts in BOTH extensions, update the
     comment at the top (year, counts, date read), and bump both versions.

  It only reads (GET the calendar list, then the same events request the
  Calendar page makes). It finds the RED DAY and WHITE DAY school calendars
  by name, so it works for any faculty account.
*/
(async () => {
  const START = '07/01/2026';
  const END = '07/01/2027';

  const list = await (
    await fetch(
      `/api/mycalendar/list/?startDate=${encodeURIComponent(START)}&endDate=${encodeURIComponent(END)}&settingsTypeId=1&calendarSetId=1&recentFilterSave=false`
    )
  ).json();
  // The events request needs the calendar's sub-filter ids (the "-1" parent id returns nothing).
  const idFor = (name) => {
    const cal = list.find((c) => (c.Calendar || '').trim().toUpperCase() === name);
    const ids = ((cal && cal.Filters) || []).map((f) => f.CalendarId);
    if (!ids.length) throw new Error(`No "${name}" calendar found in myRJ.`);
    return ids.join(',');
  };
  const ids = { Red: idFor('RED DAY'), White: idFor('WHITE DAY') };

  const tok = await (await fetch('/api/security/csrftoken')).json();
  const token = typeof tok === 'string' ? tok : tok.Token || '';
  const out = {};
  for (const color of ['Red', 'White']) {
    const res = await fetch('/api/mycalendar/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', RequestVerificationToken: token },
      body: JSON.stringify({
        bulkURL: 'mycalendar/events',
        startDate: START,
        endDate: END,
        filterString: ids[color],
        showPractice: false,
        recentSave: false,
      }),
    });
    const events = await res.json();
    out[color] = [
      ...new Set(
        events
          .filter((e) => !e.Cancelled)
          .map((e) => {
            const [m, d, y] = e.StartDate.split(' ')[0].split('/').map(Number);
            return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          })
      ),
    ].sort();
  }
  const both = out.Red.filter((d) => out.White.includes(d));
  if (both.length) console.warn('On both calendars (fix in myRJ first):', both);
  const fmt = (xs) => xs.map((x) => `'${x}'`).join(', ');
  console.log(
    `${out.Red.length} Red days, ${out.White.length} White days, ` +
      `${[...out.Red, ...out.White].sort()[0]} to ${[...out.Red, ...out.White].sort().pop()}\n\n` +
      `const RED_DAYS: string[] = [${fmt(out.Red)}];\n\nconst WHITE_DAYS: string[] = [${fmt(out.White)}];`
  );
  return out;
})();

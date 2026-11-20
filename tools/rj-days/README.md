# Red/White days

`rjDays.ts` holds the school year's Red and White days. The extension reads the table from inside itself: no network, no new permissions. After the last day in the table, nothing shows, so an old table goes quiet instead of showing a wrong color.

## Each summer (about 5 minutes)

1. Sign in to myRJ and open **Calendar**.
2. Open `fetch-rj-days.js`, change `START` and `END` to the new school year, and copy the whole file.
3. In myRJ press **F12**, click **Console**, paste, and press **Enter**. It prints the counts and two lists.
4. Paste the two lists over `RED_DAYS` and `WHITE_DAYS` in `rjDays.ts`, and update the comment at the top (year, counts, date read).
5. Copy the same `rjDays.ts` into the other extension. Students: `src/pages/Content/modules/utils/rjDays.ts`. Teachers: `src/lib/rjDays.ts`.
6. Bump both versions and send both through Partner Center.

## If the calendar changes mid-year

RJ almost never shifts the rotation. If it does, re-run the script for the current year and send a store update. Until the update is approved, the extensions show the old color for the changed days.

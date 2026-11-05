# RJ Tasks for Teachers

A Microsoft Edge extension for Regis Jesuit teachers that answers one question inside Canvas: **what needs my attention across my classes?**

It's the teacher companion to [RJ Tasks for Students](https://rjedtech.github.io/rj-tasks-site/). It is **read-only**: it never creates, changes or deletes anything in Canvas. It works only on `rjhs.instructure.com`, and student information never leaves the teacher's browser.

Homepage, install steps and privacy policy: <https://rjedtech.github.io/rj-tasks-for-teachers/>

## What teachers see

A **My Classes** card sits in Canvas's own right sidebar: on the Dashboard it covers all your classes, and on a class's home page it covers that class. Each section opens the full panel with four tabs. On other Canvas pages (or when the window is too narrow for Canvas's sidebar) a **My Classes** button in the corner opens the same panel.

By default it only reads **this semester's academic classes**: courses in RJ's current *1st Semester* or *2nd Semester* term, which are the classes under Academic Courses. PD courses, RaiderQuest, clubs, templates and sandboxes are left out. Settings has a switch to include every course you teach.

| Tab | What it does |
|---|---|
| **To grade** | Every assignment with submissions waiting, oldest wait first, across all sections. It shows late, resubmitted and quiz answers to review. One click opens SpeedGrader. |
| **Check-up** | The **RJ Baseline** (every assignment in a module, missing policy on, a graded item every week, grading kept current) plus setup slips: no due date or one outside the semester, unpublished work that's due, open/lock dates around the due date, rubric totals that don't match the points, group weights that don't add up or are switched off, 0% groups, 0-point work, work set not to count, points typos, duplicate names, weekend and 12:00 AM due times. Each item links to the fix (and to the PD how-to where there is one) and has **Ignore**. Every check can be turned off in Settings. |
| **Students** | Students with at least N missing assignments this grading period (N is 3 by default). It uses Canvas's own Missing flag. Names stay hidden until **Show names** is clicked, and hide again when the panel closes, in case the screen is projected. **Copy list** gives plain text for an email. |
| **Week** | **Grading coming in**: a 14-day chart of about how many submissions land on you each day (class size × due dates, leaving out work Canvas grades for you), so you can plan grading time. Below it, what's due from your classes each of the next 7 days, with any day flagged where one class or section has three or more graded items due. Canvas doesn't let teachers see other teachers' courses, so this covers your classes only. |

Settings lets each teacher reorder the four views, choose which appear on the sidebar card, hide the card's summary, and turn individual checks off. The card, panel and settings link to the **Regis Jesuit Professional Development** course in Canvas for questions.

The card and button only appear for people who teach or TA a class this semester. The button stays out of SpeedGrader and the Gradebook unless turned on in Settings. The sidebar card never shows student names, only counts.

## Security and privacy design

See [SECURITY.md](SECURITY.md). In short:

- The only browser permission is `storage`. The content script runs on `https://rjhs.instructure.com/*` only, top frame only.
- **GET only.** `src/lib/canvasApi.ts` is the only code that touches the network. It can send only GET requests, and only to seven listed Canvas API endpoints.
- The panel lives in a **closed shadow root** and is built only from text nodes, so a student name or assignment title can never run as code.
- No third-party runtime code at all, no remote code, no analytics. Nothing about students is written to storage.
- `tools/check-build.js` fails the build if any of this regresses.

## For maintainers

```bash
npm ci --ignore-scripts
npm test                    # unit tests (TZ=America/Denver)
npm run typecheck
npm run build               # -> build/
node tools/check-build.js build
```

End-to-end test in real Chromium against a fake teacher Canvas (made-up names, no real data):

```bash
cd tools/mock-canvas && openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem \
  -days 30 -subj "/CN=rjhs.instructure.com" -addext "subjectAltName=DNS:rjhs.instructure.com"
python3 -I server.py 8444 &
cd ../.. && E2E=1 node tools/build.js && node tools/e2e/run.js build-e2e e2e-shots
```

The e2e build differs from the shipped build in one way: its shadow root is open, so the test can look inside the panel.

| Path | What |
|---|---|
| `src/lib/canvasApi.ts` | The only network code. GET only, endpoint allowlist. |
| `src/data/checkup.ts` | Check-up rules. Each one is narrow on purpose. |
| `src/data/grading.ts`, `students.ts`, `week.ts` | The other three tabs, as pure functions. |
| `src/ui/dom.ts` | The only way the extension creates DOM: text only, no event attributes, links to RJ Canvas only. |
| `src/ui/panel.ts`, `views.ts` | Button, panel and tab rendering. |
| `docs/` | The public homepage (GitHub Pages). |

## License

MIT, © Regis Jesuit High School. See [LICENSE](LICENSE). Not affiliated with Instructure.

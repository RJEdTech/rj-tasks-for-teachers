# Security model: RJ Tasks for Teachers

RJ Tasks for Teachers runs inside a teacher's Canvas session, which can see student work and grades. The design goal is that the extension can **read** what the teacher already sees, show it on the page, and do nothing else.

## What it can do

| Capability | Limit | Enforced by |
|---|---|---|
| Browser permissions | `storage` only. No host permissions, tabs, cookies, scripting or web requests. | `manifest.json`, `check-build.js` |
| Where it runs | `https://rjhs.instructure.com/*`, top frame only, not in iframes or about:blank. | manifest, `check-build.js`, `onAllowedOrigin()` |
| Network | `fetch` from the content script only, same-origin, `GET` only, `redirect: 'error'`, `cache: 'no-store'`. | `canvasApi.ts`, `check-build.js` (no other file may fetch; no non-GET method strings) |
| Canvas endpoints | `courses`, `courses/:id/assignments`, `assignment_groups`, `students/submissions`, `grading_periods`, `users`, `users/self` (only to keep saved summaries with their owner), and (1.1, for Check-up's RJ Baseline checks) `modules`, `modules/:id/items`, `late_policy`. All GET. Pagination links are re-checked. Ids must be digits. | `canvasApi.ts` `ENDPOINTS`, `assertId` |
| Writing to Canvas | **None.** There is no write function in the codebase. | code, `check-build.js`, e2e (server and browser both record 0 non-GET requests) |
| Links it renders | Same-origin RJ Canvas links only, built from digit ids. | `canvasLink()`, `safeLink()` |

## Rendering untrusted text

Student names, assignment titles and course names are written by people, and can contain anything. The panel:

- builds DOM only through `src/ui/dom.ts`, which inserts text as text nodes and refuses `on*`, `style` and unknown attributes;
- never uses `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write` or `DOMParser` (`check-build.js` fails the build if any appear);
- lives in a **closed** shadow root, so Canvas page scripts can't read the student names inside it, and Canvas styles (or teacher-written HTML in a page) can't restyle or imitate it.

The e2e test includes a student named `<img src=x onerror=alert(1)> Test` and checks that it shows as text and that no dialog opens.

## Data handling

- Student data (names, missing work, submissions) is held in memory while the panel is open and discarded on close, refresh or page change.
- `chrome.storage.sync` holds settings only: threshold, hide-names, excluded course ids, button placement, this-semester-only, section order, sections hidden from the card, whether the card is collapsed, and which Check-up checks are off. All validated on read.
- `chrome.storage.local` holds the ids of ignored check-up items, and the teacher's own course ids and names so the settings page can list them.
- `sessionStorage` on the Canvas origin (this tab only, gone when it closes) holds: whether the user teaches a class this semester (`1`/`0`, re-checked hourly), the To grade total for the badge (5 minutes), and the sidebar card's summary (5 minutes): counts, course codes, assignment titles and ids. **No student names, ids or grades** are ever cached; the card only shows how many students have missing work.
- The sidebar card sits in Canvas's `#right-side` in its own closed shadow root, built only through `h()`; its links go through `canvasLink()`.
- No analytics, no remote code, no third-party runtime dependencies, no servers.

## Extension pages

The popup and settings pages use the CSP `default-src 'self'; script-src 'self'; object-src 'none'; style-src 'self'; img-src 'self'; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`. They can't make network requests at all. Their only links, opened in a new tab, are the homepage, the RJ feedback form, and the Regis Jesuit Professional Development course on RJ Canvas (the card, panel and Check-up also link to that course and its how-to pages, on the Canvas origin through `canvasLink()`).

The service worker accepts messages only from this extension's own content script in the top frame of an allowed Canvas page. It does two things: sets the toolbar badge number and opens the settings page.

## Reporting a problem

Use the [RJ Tasks for Teachers form](https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=4SwuQZc-CEClZjjFdYLisQzihhIB-7hPp9L3AOSeJONUMFQ0SlRPSTgwQkJCWDM4SkEzNzFPRFZDUi4u) (RJ sign-in), or submit a Help Desk ticket for anything sensitive.

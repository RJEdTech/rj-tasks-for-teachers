# Security model: RJ Tasks for Teachers

RJ Tasks for Teachers runs inside a teacher's Canvas session, which can see student work and grades. The design goal is that the extension can **read** what the teacher already sees, show it on the page, and do nothing else.

## What it can do

| Capability | Limit | Enforced by |
|---|---|---|
| Browser permissions | `storage` only. No host permissions, tabs, cookies, scripting or web requests. | `manifest.json`, `check-build.js` |
| Where it runs | `https://rjhs.instructure.com/*`, top frame only, not in iframes or about:blank. | manifest, `check-build.js`, `onAllowedOrigin()` |
| Network | `fetch` from the content script only, same-origin, `GET` only, `redirect: 'error'`, `cache: 'no-store'`. | `canvasApi.ts`, `check-build.js` (no other file may fetch; no non-GET method strings) |
| Canvas endpoints | `courses`, `courses/:id/assignments`, `assignment_groups`, `students/submissions`, `grading_periods`, `users`, `users/self/todo_item_count`. Pagination links are re-checked. Ids must be digits. | `canvasApi.ts` `ENDPOINTS`, `assertId` |
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
- `chrome.storage.sync` holds settings only: threshold, hide-names, excluded course ids, and button placement.
- `chrome.storage.local` holds the ids of ignored check-up items, and the teacher's own course ids and names so the settings page can list them.
- `sessionStorage` on the Canvas origin holds two values for the browser session: whether the user teaches a current class (`1`/`0`), and Canvas's to-grade count.
- No analytics, no remote code, no third-party runtime dependencies, no servers.

## Extension pages

The popup and settings pages use the CSP `default-src 'self'; script-src 'self'; object-src 'none'; style-src 'self'; img-src 'self'; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`. They can't make network requests at all. Their only outside links, opened in a new tab, are the homepage and the RJ feedback form.

The service worker accepts messages only from this extension's own content script in the top frame of an allowed Canvas page. It does two things: sets the toolbar badge number and opens the settings page.

## Reporting a problem

Use the [RJ Tasks for Teachers form](https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=4SwuQZc-CEClZjjFdYLisQzihhIB-7hPp9L3AOSeJONUMFQ0SlRPSTgwQkJCWDM4SkEzNzFPRFZDUi4u) (RJ sign-in), or submit a Help Desk ticket for anything sensitive.

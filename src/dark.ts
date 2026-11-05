/*
  Optional dark mode for Canvas. Off unless turned on in Settings.

  It flips the colors of the whole page, which keeps every piece of text as
  readable against its background as it was, then flips images, video and
  embeds back so they look as they were made. Images get a white sheet behind
  them so a transparent diagram with black lines stays visible. Printing is
  never affected.

  Pages where missing something would matter most (quizzes and grading) always
  stay light. Anywhere else, a bar at the bottom lets someone switch that page
  back to light mode or report a problem. The report link only opens a form,
  with this page's address (no query string) filled in. Nothing is sent unless
  the person submits the form.
*/
export const DARK_KEY = 'dark_canvas'; // chrome.storage.sync, boolean
const LIGHT_PAGES_KEY = 'dark_light_pages'; // chrome.storage.local, list of paths
const MAX_LIGHT_PAGES = 300;
const HIDE_BAR_KEY = 'rj-dark-bar-hidden'; // sessionStorage, this tab only
const CLASS_NAME = 'rj-dark-canvas';

const FORM_URL = 'https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=4SwuQZc-CEClZjjFdYLisQzihhIB-7hPp9L3AOSeJONUMFQ0SlRPSTgwQkJCWDM4SkEzNzFPRFZDUi4u';
const FORM_CHOICE_ID = 'r72d16c9e6f7c4827b3edbc412f9b16aa';
const FORM_CHOICE = 'Dark mode problem: something is hard to read or missing';
const FORM_PAGE_ID = 'r036011aeca9b49629186c9d66aa4dff5';

const PAGE_FLIP = 'invert(.93) hue-rotate(180deg)';
const FLIP_BACK = 'invert(1) hue-rotate(180deg)';
const CSS = `@media screen {
html.${CLASS_NAME} { background: #fff !important; filter: ${PAGE_FLIP} !important; }
html.${CLASS_NAME} img, html.${CLASS_NAME} video, html.${CLASS_NAME} iframe,
html.${CLASS_NAME} embed, html.${CLASS_NAME} object, html.${CLASS_NAME} canvas { filter: ${FLIP_BACK} !important; }
html.${CLASS_NAME} img, html.${CLASS_NAME} iframe, html.${CLASS_NAME} embed, html.${CLASS_NAME} object { background: #fff !important; }
html.${CLASS_NAME} img.equation_image { filter: none !important; background: transparent !important; }
html.${CLASS_NAME} #header, html.${CLASS_NAME} .ic-app-header, html.${CLASS_NAME} .ic-DashboardCard__header_image,
html.${CLASS_NAME} [data-rj-dark-bar] { filter: ${FLIP_BACK} !important; }
html.${CLASS_NAME} #header img, html.${CLASS_NAME} .ic-app-header img { filter: none !important; background: transparent !important; }
}`;

const BAR_CSS = `
:host { all: initial; position: fixed; left: 50%; transform: translateX(-50%); bottom: 12px; z-index: 2147482000; max-width: calc(100vw - 24px); }
.bar { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; padding: 5px 8px 5px 14px; border: 1px solid #c7cdd1; border-radius: 18px; background: #fff; color: #273540; box-shadow: 0 1px 4px rgba(0,0,0,.25); font: 13px/1.4 "Lato Extended", Lato, "Helvetica Neue", Helvetica, Arial, sans-serif; }
a, button { color: #0e68b3; font: inherit; }
button { padding: 0; border: 0; background: none; cursor: pointer; text-decoration: underline; }
button.x { width: 22px; height: 22px; color: #5b6870; font-size: 16px; line-height: 1; text-decoration: none; }
:focus-visible { outline: 2px solid #0e68b3; outline-offset: 2px; }
`;

/* Quizzes and grading always stay light. */
export function staysLight(path: string, title: string): boolean {
  return (
    /\/gradebook(\/|$)/.test(path) ||
    /\/courses\/\d+\/quizzes\/\d+/.test(path) ||
    /\/courses\/\d+\/assignments\/\d+\/(build|take|moderate|reports|exports|settings)(\/|$)/.test(path) ||
    /\/moderate(\/|$)/.test(path) ||
    /^Quizzes\b/.test(title)
  );
}

export function reportUrl(page: string): string {
  return (
    `${FORM_URL}&${FORM_CHOICE_ID}=${encodeURIComponent(`"${FORM_CHOICE}"`)}` +
    `&${FORM_PAGE_ID}=${encodeURIComponent(page)}`
  );
}

function start(): void {
  if (window.top !== window || window.location.origin !== 'https://rjhs.instructure.com') return;
  const html = document.documentElement;
  const style = document.createElement('style');
  style.textContent = CSS;
  html.appendChild(style);

  let enabled = false;
  let lightPages: string[] = [];
  let bar: HTMLElement | null = null;
  const path = () => window.location.pathname;

  const barHidden = () => {
    try {
      return window.sessionStorage.getItem(HIDE_BAR_KEY) === '1';
    } catch {
      return false;
    }
  };

  const setPageLight = (light: boolean) => {
    const others = lightPages.filter((p) => p !== path());
    lightPages = (light ? [...others, path()] : others).slice(-MAX_LIGHT_PAGES);
    chrome.storage.local.set({ [LIGHT_PAGES_KEY]: lightPages });
    update();
  };

  const link = (text: string, onClick: () => void): HTMLElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.addEventListener('click', onClick);
    return b;
  };

  const drawBar = (pageLight: boolean) => {
    bar?.remove();
    bar = null;
    if (!document.body || barHidden()) return;
    const host = document.createElement('div');
    host.setAttribute('data-rj-dark-bar', '');
    const root = host.attachShadow({ mode: 'open' });
    const css = document.createElement('style');
    css.textContent = BAR_CSS;
    const box = document.createElement('div');
    box.className = 'bar';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', 'Dark mode');
    const report = document.createElement('a');
    report.textContent = 'Report it';
    report.href = reportUrl(window.location.origin + path());
    report.target = '_blank';
    report.rel = 'noopener noreferrer';
    const close = link('×', () => {
      try {
        window.sessionStorage.setItem(HIDE_BAR_KEY, '1');
      } catch {
        /* storage blocked: it just comes back on the next page */
      }
      drawBar(pageLight);
    });
    close.className = 'x';
    close.setAttribute('aria-label', 'Hide this message for now');
    const message = document.createElement('span');
    message.textContent = pageLight ? 'This page is in light mode.' : 'Something hard to read?';
    box.append(
      message,
      pageLight
        ? link('Back to dark mode', () => setPageLight(false))
        : link('Show this page in light mode', () => setPageLight(true)),
      report,
      close
    );
    // stay clear of Canvas's Student View bar
    if (document.body.classList.contains('is-masquerading-or-student-view')) host.style.bottom = '56px';
    root.append(css, box);
    document.body.appendChild(host);
    bar = host;
  };

  const update = () => {
    const forced = staysLight(path(), document.title);
    const pageLight = lightPages.includes(path());
    html.classList.toggle(CLASS_NAME, enabled && !forced && !pageLight);
    if (enabled && !forced) drawBar(pageLight);
    else {
      bar?.remove();
      bar = null;
    }
  };

  chrome.storage.sync.get(DARK_KEY, (sync) => {
    enabled = sync[DARK_KEY] === true;
    chrome.storage.local.get(LIGHT_PAGES_KEY, (local) => {
      const saved = local[LIGHT_PAGES_KEY];
      lightPages = Array.isArray(saved) ? saved.filter((p) => typeof p === 'string') : [];
      update();
    });
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && DARK_KEY in changes) {
      enabled = changes[DARK_KEY].newValue === true;
      update();
    }
  });
  // The body doesn't exist yet at this point, and New Quizzes changes the title
  // and address without loading a new page.
  document.addEventListener('DOMContentLoaded', () => {
    update();
    const title = document.querySelector('head > title');
    if (title) new MutationObserver(update).observe(title, { childList: true, characterData: true, subtree: true });
  });
}

if (typeof chrome !== 'undefined' && chrome.storage) start();

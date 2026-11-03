/*
  Content script: runs only on https://rjhs.instructure.com/* (top frame).
  For people who teach a class this semester it adds:
  - a card in Canvas's right sidebar on the Dashboard (all classes) and on
    a class's home page (that class), and
  - the floating My Classes button on other pages, or wherever the sidebar
    is hidden (narrow windows).
*/
import { canvasGetAll, onAllowedOrigin } from './lib/canvasApi';
import { CanvasCourse } from './lib/types';
import { isShownCourse } from './data/courses';
import { Loader } from './data/loader';
import { loadSettings, onSettingsChanged, Settings } from './lib/settings';
import { Panel } from './ui/panel';
import { SidebarCard, cardSlot, isShown } from './ui/card';

const ROLE_KEY = 'rjtt-teaches-v2'; // sessionStorage: '1' or '0' per filter, this browser session only
const BADGE_KEY = 'rjtt-badge-v2'; // sessionStorage: {n, t, k}, a number only
const BADGE_TTL_MS = 5 * 60 * 1000;

export function courseIdFromPath(path: string): string | null {
  const m = path.match(/^\/courses\/(\d{1,20})(?:\/|$)/);
  return m ? m[1] : null;
}

/* SpeedGrader and the Gradebook have their own controls in the corner. */
export function isGradingPage(path: string): boolean {
  return /^\/courses\/\d{1,20}\/gradebook(?:\/|$)/.test(path);
}

/* Which page gets a sidebar card: the Dashboard, or a course's home page. */
export function cardKind(path: string): 'dashboard' | 'course' | null {
  if (path === '/' || path === '/dashboard' || path === '') return 'dashboard';
  if (/^\/courses\/\d{1,20}\/?$/.test(path)) return 'course';
  return null;
}

function readSession(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    /* storage blocked: just ask Canvas again next time */
  }
}

/* A short key for the settings that change which classes count. */
function filterKey(s: Settings): string {
  return `${s.allClasses ? 'all' : 'sem'}:${s.excludedCourses.slice().sort().join(',')}`;
}

async function teachesSomething(s: Settings): Promise<boolean> {
  const key = `${ROLE_KEY}:${s.allClasses ? 'all' : 'sem'}`;
  const cached = readSession(key);
  if (cached === '1' || cached === '0') return cached === '1';
  const { items } = await canvasGetAll<CanvasCourse>(
    '/api/v1/courses?enrollment_state=active&include[]=term&per_page=100',
    4
  );
  const now = new Date();
  const yes = items.some((c) => isShownCourse(c, now, s.allClasses));
  writeSession(key, yes ? '1' : '0');
  return yes;
}

function cachedBadge(s: Settings): number | null {
  try {
    const raw = readSession(BADGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { n?: unknown; t?: unknown; k?: unknown };
    if (typeof v.n === 'number' && typeof v.t === 'number' && v.k === filterKey(s) && Date.now() - v.t < BADGE_TTL_MS)
      return v.n;
  } catch {
    /* ignore a bad cache entry */
  }
  return null;
}

function sendBadge(n: number | null): void {
  try {
    void chrome.runtime.sendMessage({ type: 'badge', count: n ?? 0 }).catch(() => undefined);
  } catch {
    /* extension was reloaded; ignore */
  }
}

export async function start(): Promise<{ panel: Panel; card: SidebarCard | null } | null> {
  if (!onAllowedOrigin() || window.top !== window) return null;
  let settings = await loadSettings();
  try {
    if (!(await teachesSomething(settings))) return null;
  } catch {
    return null; // signed out, or Canvas unreachable
  }

  const path = window.location.pathname;
  const courseId = courseIdFromPath(path);
  const loader = new Loader();
  let card: SidebarCard | null = null;

  const setBadge = (n: number | null) => {
    panel.setBadge(n);
    sendBadge(n);
    if (n !== null) writeSession(BADGE_KEY, JSON.stringify({ n, t: Date.now(), k: filterKey(settings) }));
  };

  const panel = new Panel({
    settings,
    loader,
    currentCourseId: courseId,
    showButton: false,
    openSettings: () => {
      try {
        void chrome.runtime.sendMessage({ type: 'open-settings' }).catch(() => undefined);
      } catch {
        /* ignore */
      }
    },
    onClosed: () => card?.host.focus(),
  });
  document.documentElement.appendChild(panel.host);

  // The sidebar card, on the Dashboard and on home pages of this semester's classes.
  const kind = cardKind(path);
  if (kind) {
    let wanted = kind === 'dashboard';
    if (kind === 'course') {
      try {
        const shown = await loader.courses(settings.excludedCourses, settings.allClasses);
        wanted = shown.some((c) => c.id === courseId);
      } catch {
        wanted = false;
      }
    }
    const slot = wanted ? cardSlot(document, kind) : null;
    if (slot) {
      card = new SidebarCard({
        loader,
        settings,
        courseId: kind === 'course' ? courseId : null,
        onOpen: (tab) => void panel.openAt(tab, kind === 'course' ? courseId! : 'all'),
        onGradeCount: kind === 'dashboard' ? (n) => setBadge(n) : undefined,
      });
      card.host.tabIndex = -1;
      slot.parent.insertBefore(card.host, slot.before);
      void card.load();
    }
  }

  // The floating button: wherever the card isn't showing (other pages, or a
  // window too narrow for Canvas to show its sidebar).
  const placeButton = () => {
    if (card && isShown(card.host)) return panel.setLauncherVisible(false);
    if (card) return panel.setLauncherVisible(true);
    if (isGradingPage(path)) return panel.setLauncherVisible(settings.buttonOnGradingPages);
    panel.setLauncherVisible(settings.buttonElsewhere);
  };
  placeButton();
  let t: number | undefined;
  window.addEventListener('resize', () => {
    window.clearTimeout(t);
    t = window.setTimeout(placeButton, 200);
  });

  onSettingsChanged((s) => {
    const reload = filterKey(s) !== filterKey(settings) || s.missingThreshold !== settings.missingThreshold;
    settings = s;
    panel.updateSettings(s);
    if (card && reload) card.updateSettings(s);
    placeButton();
  });

  // Toolbar and button badge: this semester's to-grade count (the Dashboard
  // card sets it as soon as its To grade section loads).
  const cached = cachedBadge(settings);
  if (cached !== null) {
    panel.setBadge(cached);
    sendBadge(cached);
  } else if (!(card && kind === 'dashboard')) {
    void loader
      .courses(settings.excludedCourses, settings.allClasses)
      .then((cs) => loader.gradeCount(cs))
      .then((n) => setBadge(n))
      .catch(() => undefined);
  }
  return { panel, card };
}

if (typeof chrome !== 'undefined' && chrome.runtime?.id) void start();

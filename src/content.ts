/*
  Content script: runs only on https://rjhs.instructure.com/* (top frame).
  Shows the My Classes button to people who teach a current Canvas class.
*/
import { canvasGetAll, onAllowedOrigin } from './lib/canvasApi';
import { CanvasCourse } from './lib/types';
import { isCurrentTeachingCourse } from './data/courses';
import { needsGradingCount } from './data/loader';
import { loadSettings, onSettingsChanged } from './lib/settings';
import { Panel } from './ui/panel';

const ROLE_KEY = 'rjtt-teaches'; // sessionStorage: '1' or '0', for this browser session only
const BADGE_KEY = 'rjtt-badge'; // sessionStorage: {n, t}, a number only
const BADGE_TTL_MS = 5 * 60 * 1000;

export function courseIdFromPath(path: string): string | null {
  const m = path.match(/^\/courses\/(\d{1,20})(?:\/|$)/);
  return m ? m[1] : null;
}

/* SpeedGrader and the Gradebook have their own controls in the corner. */
export function isGradingPage(path: string): boolean {
  return /^\/courses\/\d{1,20}\/gradebook(?:\/|$)/.test(path);
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

async function teachesSomething(): Promise<boolean> {
  const cached = readSession(ROLE_KEY);
  if (cached === '1' || cached === '0') return cached === '1';
  const { items } = await canvasGetAll<CanvasCourse>(
    '/api/v1/courses?enrollment_state=active&include[]=term&per_page=100',
    4
  );
  const yes = items.some((c) => isCurrentTeachingCourse(c, new Date()));
  writeSession(ROLE_KEY, yes ? '1' : '0');
  return yes;
}

async function badgeCount(): Promise<number | null> {
  try {
    const raw = readSession(BADGE_KEY);
    if (raw) {
      const v = JSON.parse(raw) as { n?: unknown; t?: unknown };
      if (typeof v.n === 'number' && typeof v.t === 'number' && Date.now() - v.t < BADGE_TTL_MS) return v.n;
    }
  } catch {
    /* ignore a bad cache entry */
  }
  const n = await needsGradingCount();
  if (n !== null) writeSession(BADGE_KEY, JSON.stringify({ n, t: Date.now() }));
  return n;
}

function sendBadge(n: number | null): void {
  try {
    void chrome.runtime.sendMessage({ type: 'badge', count: n ?? 0 }).catch(() => undefined);
  } catch {
    /* extension was reloaded; ignore */
  }
}

export async function start(): Promise<Panel | null> {
  if (!onAllowedOrigin() || window.top !== window) return null;
  let teaches = false;
  try {
    teaches = await teachesSomething();
  } catch {
    return null; // signed out, or Canvas unreachable
  }
  if (!teaches) return null;

  const settings = await loadSettings();
  const path = window.location.pathname;
  const panel = new Panel({
    settings,
    currentCourseId: courseIdFromPath(path),
    showButton: settings.buttonOnGradingPages || !isGradingPage(path),
    openSettings: () => {
      try {
        void chrome.runtime.sendMessage({ type: 'open-settings' }).catch(() => undefined);
      } catch {
        /* ignore */
      }
    },
  });
  document.documentElement.appendChild(panel.host);
  onSettingsChanged((s) => panel.updateSettings(s));

  const n = await badgeCount();
  panel.setBadge(n);
  sendBadge(n);
  return panel;
}

if (typeof chrome !== 'undefined' && chrome.runtime?.id) void start();

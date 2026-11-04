/*
  Settings live in chrome.storage.sync (follows the teacher's Edge profile).
  "Ignored" check-up items are ids only and live in chrome.storage.local.
  No student names or grades are ever written to storage.
*/
export type Section = 'grade' | 'checkup' | 'students' | 'week';
export const SECTIONS: Section[] = ['grade', 'checkup', 'students', 'week'];

/* Saved settings can be old or damaged: keep known sections once each, in
   the saved order, and add any missing ones at the end. */
export function normalizeOrder(saved: unknown): Section[] {
  const out: Section[] = [];
  if (Array.isArray(saved))
    for (const x of saved) if (SECTIONS.includes(x as Section) && !out.includes(x as Section)) out.push(x as Section);
  for (const x of SECTIONS) if (!out.includes(x)) out.push(x);
  return out;
}

export interface Settings {
  missingThreshold: number; // show students with at least this many missing
  hideNames: boolean; // names stay hidden until "Show names" is clicked
  excludedCourses: string[]; // course ids the teacher chose to leave out
  buttonOnGradingPages: boolean; // show the button in SpeedGrader and the Gradebook
  allClasses: boolean; // false: only this semester's academic classes
  buttonElsewhere: boolean; // floating button on pages without the sidebar card
  sectionOrder: Section[]; // order of the card's sections and the panel's tabs
  cardHidden: Section[]; // sections left out of the sidebar card (the panel keeps every tab)
  cardCollapsed: boolean; // the card's Hide button: just its header shows
  checksOff: string[]; // Check-up rules the teacher turned off
}

export const DEFAULTS: Settings = {
  missingThreshold: 3,
  hideNames: true,
  excludedCourses: [],
  buttonOnGradingPages: false,
  allClasses: false,
  buttonElsewhere: true,
  sectionOrder: [...SECTIONS],
  cardHidden: [],
  cardCollapsed: false,
  checksOff: [],
};

const THRESHOLDS = [1, 2, 3, 4, 5];

/* Anything read back from storage is checked; bad values fall back to defaults. */
export function clean(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    missingThreshold: THRESHOLDS.includes(r.missingThreshold as number)
      ? (r.missingThreshold as number)
      : DEFAULTS.missingThreshold,
    hideNames: typeof r.hideNames === 'boolean' ? r.hideNames : DEFAULTS.hideNames,
    excludedCourses: Array.isArray(r.excludedCourses)
      ? r.excludedCourses.map(String).filter((s) => /^\d{1,20}$/.test(s)).slice(0, 200)
      : [],
    buttonOnGradingPages:
      typeof r.buttonOnGradingPages === 'boolean' ? r.buttonOnGradingPages : DEFAULTS.buttonOnGradingPages,
    allClasses: typeof r.allClasses === 'boolean' ? r.allClasses : DEFAULTS.allClasses,
    buttonElsewhere: typeof r.buttonElsewhere === 'boolean' ? r.buttonElsewhere : DEFAULTS.buttonElsewhere,
    sectionOrder: normalizeOrder(r.sectionOrder),
    cardHidden: Array.isArray(r.cardHidden)
      ? SECTIONS.filter((x) => (r.cardHidden as unknown[]).includes(x))
      : [],
    cardCollapsed: typeof r.cardCollapsed === 'boolean' ? r.cardCollapsed : false,
    checksOff: Array.isArray(r.checksOff)
      ? r.checksOff.filter((x): x is string => typeof x === 'string' && /^[a-z_]{1,30}$/.test(x)).slice(0, 50)
      : [],
  };
}

export async function loadSettings(): Promise<Settings> {
  try {
    const got = await chrome.storage.sync.get('settings');
    return clean(got.settings);
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  await chrome.storage.sync.set({ settings: clean(s) });
}

export function onSettingsChanged(fn: (s: Settings) => void): void {
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.settings) fn(clean(changes.settings.newValue));
    });
  } catch {
    /* not in an extension context (tests) */
  }
}

const IGNORE_KEY = /^\d{1,20}:[a-z_]{1,30}:(\d{1,20}|course)$/;

export async function loadIgnored(): Promise<Set<string>> {
  try {
    const got = await chrome.storage.local.get('ignored');
    const list = Array.isArray(got.ignored) ? got.ignored : [];
    return new Set(list.filter((k: unknown) => typeof k === 'string' && IGNORE_KEY.test(k)));
  } catch {
    return new Set();
  }
}

export async function setIgnored(keys: Set<string>): Promise<void> {
  const list = [...keys].filter((k) => IGNORE_KEY.test(k)).slice(-2000);
  await chrome.storage.local.set({ ignored: list });
}

/* The classes the teacher teaches (ids and names only), so the settings page
   can list them. The settings page itself can't reach Canvas. */
export interface KnownCourse {
  id: string;
  code: string;
  name: string;
}

export async function saveKnownCourses(list: KnownCourse[]): Promise<void> {
  const clean = list
    .filter((c) => /^\d{1,20}$/.test(String(c.id)))
    .slice(0, 100)
    .map((c) => ({ id: String(c.id), code: String(c.code).slice(0, 120), name: String(c.name).slice(0, 200) }));
  await chrome.storage.local.set({ knownCourses: clean });
}

export async function loadKnownCourses(): Promise<KnownCourse[]> {
  try {
    const got = await chrome.storage.local.get('knownCourses');
    return Array.isArray(got.knownCourses)
      ? got.knownCourses.filter(
          (c: KnownCourse) =>
            c && /^\d{1,20}$/.test(String(c.id)) && typeof c.code === 'string' && typeof c.name === 'string'
        )
      : [];
  } catch {
    return [];
  }
}

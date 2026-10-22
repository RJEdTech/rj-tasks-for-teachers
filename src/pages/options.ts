import { FEEDBACK_FORM_URL, HOMEPAGE_URL } from '../lib/constants';
import { loadKnownCourses, loadSettings, saveSettings, Settings } from '../lib/settings';
import { h, clear } from '../ui/dom';

let settings: Settings;
const saved = document.getElementById('saved')!;

async function save(next: Settings): Promise<void> {
  settings = next;
  try {
    await saveSettings(settings);
    saved.textContent = 'Saved.';
  } catch {
    saved.textContent = "Couldn't save. Try again.";
  }
  window.setTimeout(() => (saved.textContent = ''), 2500);
}

async function init(): Promise<void> {
  settings = await loadSettings();

  const th = document.getElementById('threshold')!;
  for (const n of [1, 2, 3, 4, 5]) {
    const input = h('input', { type: 'radio', name: 'threshold', value: n }) as HTMLInputElement;
    input.checked = settings.missingThreshold === n;
    input.addEventListener('change', () => void save({ ...settings, missingThreshold: n }));
    th.append(h('label', {}, input, h('span', {}, `${n} or more missing${n === 3 ? ' (recommended)' : ''}`)));
  }

  const hide = document.getElementById('hideNames') as HTMLInputElement;
  hide.checked = settings.hideNames;
  hide.addEventListener('change', () => void save({ ...settings, hideNames: hide.checked }));

  const btn = document.getElementById('buttonOnGradingPages') as HTMLInputElement;
  btn.checked = settings.buttonOnGradingPages;
  btn.addEventListener('change', () => void save({ ...settings, buttonOnGradingPages: btn.checked }));

  const box = document.getElementById('classes')!;
  const known = await loadKnownCourses();
  clear(box);
  if (!known.length) {
    box.append(h('p', { class: 'help' }, 'Open Canvas and click My Classes once, and your classes will show up here.'));
  }
  for (const c of known) {
    const input = h('input', { type: 'checkbox' }) as HTMLInputElement;
    input.checked = !settings.excludedCourses.includes(c.id);
    input.addEventListener('change', () => {
      const ex = new Set(settings.excludedCourses);
      if (input.checked) ex.delete(c.id);
      else ex.add(c.id);
      void save({ ...settings, excludedCourses: [...ex] });
    });
    box.append(h('label', {}, input, h('span', {}, c.code === c.name ? c.name : `${c.code} · ${c.name}`)));
  }

  if (FEEDBACK_FORM_URL) {
    (document.getElementById('feedback') as HTMLAnchorElement).href = FEEDBACK_FORM_URL;
    document.getElementById('feedback-box')!.hidden = false;
  }
  (document.getElementById('homepage') as HTMLAnchorElement).href = HOMEPAGE_URL;
}

void init();

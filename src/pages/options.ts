import { FEEDBACK_FORM_URL, HOMEPAGE_URL, PD_URL } from '../lib/constants';
import { RULE_INFO } from '../data/checkup';
import { loadKnownCourses, loadSettings, saveSettings, Settings, Section, SECTIONS } from '../lib/settings';
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

  const sem = document.getElementById('semesterOnly') as HTMLInputElement;
  sem.checked = !settings.allClasses;
  sem.addEventListener('change', () => void save({ ...settings, allClasses: !sem.checked }));

  const elsewhere = document.getElementById('buttonElsewhere') as HTMLInputElement;
  elsewhere.checked = settings.buttonElsewhere;
  elsewhere.addEventListener('change', () => void save({ ...settings, buttonElsewhere: elsewhere.checked }));

  renderOrder();

  const collapsed = document.getElementById('cardCollapsed') as HTMLInputElement;
  collapsed.checked = settings.cardCollapsed;
  collapsed.addEventListener('change', () => void save({ ...settings, cardCollapsed: collapsed.checked }));

  renderChecks();
  document.getElementById('checks-all')!.addEventListener('click', () => {
    void save({ ...settings, checksOff: [] }).then(renderChecks);
  });
  (document.getElementById('pd') as HTMLAnchorElement).href = PD_URL;
  document.getElementById('reset-order')!.addEventListener('click', () => {
    void save({ ...settings, sectionOrder: [...SECTIONS] }).then(() => {
      renderOrder();

  const collapsed = document.getElementById('cardCollapsed') as HTMLInputElement;
  collapsed.checked = settings.cardCollapsed;
  collapsed.addEventListener('change', () => void save({ ...settings, cardCollapsed: collapsed.checked }));

  renderChecks();
  document.getElementById('checks-all')!.addEventListener('click', () => {
    void save({ ...settings, checksOff: [] }).then(renderChecks);
  });
  (document.getElementById('pd') as HTMLAnchorElement).href = PD_URL;
      announce('Order reset: To grade, Check-up, Students, Week.');
    });
  });

  const box = document.getElementById('classes')!;
  const known = await loadKnownCourses();
  clear(box);
  if (!known.length) {
    box.append(h('p', { class: 'help' }, 'Open Canvas and click My Classes once, and your classes will show up here. (After changing “Only this semester’s classes,” open My Classes again to refresh this list.)'));
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

/* Every Check-up rule as a checkbox, in three groups. */
function renderChecks(): void {
  const box = document.getElementById('checks')!;
  clear(box);
  const groups: Array<[string, string]> = [
    ['baseline', 'RJ Baseline'],
    ['fix', 'Setup problems (to fix)'],
    ['check', 'Worth a look'],
  ];
  for (const [g, title] of groups) {
    const part = h('div', { class: 'group', role: 'group', 'aria-label': title }, h('p', { class: 'gtitle' }, title));
    for (const r of RULE_INFO.filter((x) => x.group === g)) {
      const cb = h('input', { type: 'checkbox', 'data-rule': r.rule }) as HTMLInputElement;
      cb.checked = !settings.checksOff.includes(r.rule);
      cb.addEventListener('change', () => {
        const off = new Set(settings.checksOff);
        if (cb.checked) off.delete(r.rule);
        else off.add(r.rule);
        void save({ ...settings, checksOff: RULE_INFO.map((x) => x.rule).filter((x) => off.has(x)) });
      });
      part.append(h('label', {}, cb, h('span', {}, r.label)));
    }
    box.append(part);
  }
}

const LABELS: Record<Section, string> = { grade: 'To grade', checkup: 'Check-up', students: 'Students', week: 'Week' };

function announce(msg: string): void {
  const el = document.getElementById('order-status')!;
  el.textContent = '';
  window.setTimeout(() => (el.textContent = msg), 50);
}

/* Each section: a checkbox (on the sidebar card or not) and Move up / Move
   down buttons. Buttons rather than drag and drop, so it works from the
   keyboard; focus stays on the button that was pressed. */
function renderOrder(focus?: { id: Section; dir: 'up' | 'down' }): void {
  const list = document.getElementById('order')!;
  clear(list);
  const order = settings.sectionOrder;
  order.forEach((id, i) => {
    const cb = h('input', { type: 'checkbox', 'data-sec': id }) as HTMLInputElement;
    cb.checked = !settings.cardHidden.includes(id);
    cb.addEventListener('change', () => {
      const hidden = new Set(settings.cardHidden);
      if (cb.checked) hidden.delete(id);
      else hidden.add(id);
      void save({ ...settings, cardHidden: SECTIONS.filter((x) => hidden.has(x)) });
    });
    const move = (dir: 'up' | 'down') => {
      const j = dir === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= order.length) return;
      const next = [...order];
      [next[i], next[j]] = [next[j], next[i]];
      void save({ ...settings, sectionOrder: next });
      renderOrder({ id, dir });
      announce(`${LABELS[id]} is now number ${j + 1} of ${order.length}.`);
    };
    const up = h('button', { type: 'button', class: 'arrow', 'aria-label': `Move ${LABELS[id]} up`, disabled: i === 0, 'data-move': `${id}-up` }, '↑');
    const down = h('button', { type: 'button', class: 'arrow', 'aria-label': `Move ${LABELS[id]} down`, disabled: i === order.length - 1, 'data-move': `${id}-down` }, '↓');
    up.addEventListener('click', () => move('up'));
    down.addEventListener('click', () => move('down'));
    list.append(h('li', {}, h('div', { class: 'orow' }, h('label', {}, cb, h('span', {}, LABELS[id])), h('span', { class: 'arrows' }, up, down))));
  });
  if (focus) {
    const want = list.querySelector(`[data-move="${focus.id}-${focus.dir}"]`) as HTMLButtonElement | null;
    const other = list.querySelector(`[data-move="${focus.id}-${focus.dir === 'up' ? 'down' : 'up'}"]`) as HTMLButtonElement | null;
    (want && !want.disabled ? want : other)?.focus();
  }
}

void init();

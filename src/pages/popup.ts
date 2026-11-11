import { FEEDBACK_FORM_URL, HOMEPAGE_URL } from '../lib/constants';
import { isOff, onOffChanged, setOff } from '../lib/onOff';

document.getElementById('open-settings')?.addEventListener('click', () => {
  void chrome.runtime.openOptionsPage();
  window.close();
});
const fb = document.getElementById('feedback') as HTMLAnchorElement | null;
if (fb && FEEDBACK_FORM_URL) {
  fb.href = FEEDBACK_FORM_URL;
  fb.hidden = false;
}
const home = document.getElementById('homepage') as HTMLAnchorElement | null;
if (home) home.href = HOMEPAGE_URL;

/* On/off switch. The badge on the icon says OFF while it's off. */
const power = document.getElementById('power') as HTMLButtonElement | null;
const powerState = document.getElementById('power-state');

function showOff(off: boolean): void {
  document.body.classList.toggle('is-off', off);
  power?.setAttribute('aria-checked', String(!off));
  if (powerState) powerState.textContent = off ? 'off' : 'on';
}

void isOff().then((off) => {
  showOff(off);
  if (power) power.disabled = false;
});
onOffChanged(showOff);
power?.addEventListener('click', () => {
  const turnOff = power.getAttribute('aria-checked') === 'true';
  showOff(turnOff);
  void setOff(turnOff);
});

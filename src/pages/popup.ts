import { FEEDBACK_FORM_URL, HOMEPAGE_URL } from '../lib/constants';

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

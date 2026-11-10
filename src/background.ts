/*
  Service worker. Two jobs only: show the to-grade count on the toolbar icon
  (or OFF while it's turned off in the popup), and open the settings page. It accepts messages only from this extension's
  own content script running on an allowed Canvas page.
*/
import { ALLOWED_ORIGINS, PRODUCT_NAME } from './lib/constants';
import { isOff, onOffChanged } from './lib/onOff';

/* Counts are per tab, so OFF goes on every open tab as well as the default
   (new tabs). Turned back on, the badges clear and each Canvas tab sends its
   count again. Tab ids need no permission. */
async function paintOff(off: boolean): Promise<void> {
  const text = off ? 'OFF' : '';
  const color = off ? '#6b7280' : '#C11430';
  const title = off ? `${PRODUCT_NAME}: off. Click to turn it back on.` : PRODUCT_NAME;
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
  await chrome.action.setTitle({ title });
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) {
    if (t.id === undefined) continue;
    const tabId = t.id;
    void chrome.action.setBadgeBackgroundColor({ tabId, color }).catch(() => undefined);
    void chrome.action.setBadgeText({ tabId, text }).catch(() => undefined);
    void chrome.action.setTitle({ tabId, title }).catch(() => undefined);
  }
}

onOffChanged((off) => void paintOff(off));
// The worker sleeps and wakes: make sure the icon still says OFF.
void isOff().then((off) => {
  if (off) void paintOff(true);
});

function fromOurCanvasTab(sender: chrome.runtime.MessageSender): boolean {
  if (sender.id !== chrome.runtime.id) return false;
  const url = sender.tab?.url ?? sender.url;
  if (!url) return false;
  try {
    return ALLOWED_ORIGINS.includes(new URL(url).origin) && sender.frameId === 0;
  } catch {
    return false;
  }
}

chrome.runtime.onMessage.addListener((msg: unknown, sender) => {
  if (!fromOurCanvasTab(sender) || !msg || typeof msg !== 'object') return;
  const m = msg as { type?: unknown; count?: unknown };
  if (m.type === 'badge') {
    void showCount(m.count, sender.tab?.id);
  } else if (m.type === 'open-settings') {
    void chrome.runtime.openOptionsPage();
  }
});

async function showCount(count: unknown, tabId: number | undefined): Promise<void> {
  if (tabId === undefined || (await isOff())) return;
  const n = typeof count === 'number' && Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  void chrome.action.setBadgeBackgroundColor({ tabId, color: '#C11430' });
  void chrome.action.setBadgeText({ tabId, text: n ? (n > 99 ? '99+' : String(n)) : '' });
}

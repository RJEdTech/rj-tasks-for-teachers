/*
  Service worker. Two jobs only: show the to-grade count on the toolbar icon,
  and open the settings page. It accepts messages only from this extension's
  own content script running on an allowed Canvas page.
*/
import { ALLOWED_ORIGINS } from './lib/constants';

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
    const n = typeof m.count === 'number' && Number.isFinite(m.count) ? Math.max(0, Math.floor(m.count)) : 0;
    const tabId = sender.tab?.id;
    if (tabId === undefined) return;
    void chrome.action.setBadgeBackgroundColor({ tabId, color: '#C11430' });
    void chrome.action.setBadgeText({ tabId, text: n ? (n > 99 ? '99+' : String(n)) : '' });
  } else if (m.type === 'open-settings') {
    void chrome.runtime.openOptionsPage();
  }
});

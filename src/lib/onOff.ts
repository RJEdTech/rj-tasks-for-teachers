/*
  The on/off switch in the toolbar popup.

  Off pauses RJ Tasks for Teachers on Canvas: the sidebar card, the My Classes
  button and dark mode all go away right away, and nothing runs on the next
  page. The extension stays installed, and every setting is kept for when it
  is turned back on. A missing value means on.
*/
export const OFF_KEY = 'rjtt_off'; // chrome.storage.sync, boolean

export async function isOff(): Promise<boolean> {
  try {
    const got = await chrome.storage.sync.get(OFF_KEY);
    return got[OFF_KEY] === true;
  } catch {
    return false;
  }
}

export function onOffChanged(callback: (off: boolean) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && OFF_KEY in changes) callback(changes[OFF_KEY].newValue === true);
  });
}

export function setOff(off: boolean): Promise<void> {
  return chrome.storage.sync.set({ [OFF_KEY]: off });
}

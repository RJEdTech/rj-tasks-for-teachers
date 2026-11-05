/*
  Canvas puts the same body class on two different things:
  - Act as User: an admin looking through a real teacher's account. RJ Tasks
    keeps working, so support and training can see what that teacher sees.
  - Student View: a fake student. RJ Tasks stays off.
  Only Act as User has the "Stop Acting as User" link.
*/
import { canvasGet } from './canvasApi';

const CLASS = 'is-masquerading-or-student-view';
const STOP_LINK = 'a[data-method="post"][href*="/masquerade"]';

export function isActingAs(): boolean {
  return document.body.classList.contains(CLASS) && !!document.querySelector(STOP_LINK);
}

export function isStudentView(): boolean {
  return document.body.classList.contains(CLASS) && !document.querySelector(STOP_LINK);
}

/*
  This tab's saved summaries belong to one Canvas user. An admin can act as a
  teacher in another tab, or go Back to a page from before they started, so
  the page alone can't say whose session this is: Canvas's answer is checked
  on every load. Without an answer, nothing is saved or reused.
*/
let owner: string | null = null;

export async function loadOwner(): Promise<void> {
  try {
    const me = await canvasGet<{ id?: unknown }>('/api/v1/users/self');
    owner = /^\d{1,20}$/.test(String(me.id ?? '')) ? String(me.id) : null;
  } catch {
    owner = null;
  }
}

/* The storage key for this user, or null if nothing should be saved. */
export function ownedKey(key: string): string | null {
  return owner && !isActingAs() ? `${key}@${owner}` : null;
}

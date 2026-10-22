/*
  RJ Tasks for Teachers — the only module allowed to touch the network.

  Rules (see SECURITY.md):
  1. Read-only. This module can only send GET requests. There is no code path
     that creates, changes or deletes anything in Canvas.
  2. Same origin only, and only on ALLOWED_ORIGINS (rjhs.instructure.com).
  3. Only the exact Canvas API endpoints listed in ENDPOINTS. Pagination
     "next" links from Canvas are re-checked against the same list.
  4. Redirects are refused, cookies stay same-origin, nothing is cached.
  5. Ids placed into paths must be plain digits.
*/
import { ALLOWED_ORIGINS } from './constants';

const ID = '\\d{1,20}';
const ENDPOINTS: RegExp[] = [
  /^\/api\/v1\/courses$/,
  new RegExp(`^/api/v1/courses/${ID}/assignments$`),
  new RegExp(`^/api/v1/courses/${ID}/assignment_groups$`),
  new RegExp(`^/api/v1/courses/${ID}/students/submissions$`),
  new RegExp(`^/api/v1/courses/${ID}/grading_periods$`),
  new RegExp(`^/api/v1/courses/${ID}/users$`),
  /^\/api\/v1\/users\/self\/todo_item_count$/,
];

export class CanvasApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = 'CanvasApiError';
    this.status = status;
  }
}

export function onAllowedOrigin(): boolean {
  return ALLOWED_ORIGINS.includes(window.location.origin);
}

/* Throws unless `id` is a plain Canvas numeric id. */
export function assertId(id: unknown): string {
  const s = String(id ?? '');
  if (!/^\d{1,20}$/.test(s)) throw new CanvasApiError('Rejected invalid id');
  return s;
}

export function resolveApiUrl(pathOrUrl: string): URL {
  if (!onAllowedOrigin())
    throw new CanvasApiError('RJ Tasks for Teachers only runs on RJ Canvas');
  let url: URL;
  try {
    url = new URL(pathOrUrl, window.location.origin);
  } catch {
    throw new CanvasApiError('Rejected malformed URL');
  }
  if (url.origin !== window.location.origin)
    throw new CanvasApiError('Rejected cross-origin request');
  if (url.username || url.password)
    throw new CanvasApiError('Rejected URL with credentials');
  if (!ENDPOINTS.some((re) => re.test(url.pathname)))
    throw new CanvasApiError('Rejected endpoint ' + url.pathname);
  return url;
}

function parseCanvasJson<T>(text: string): T {
  const body = text.replace(/^while\(1\);/, '').trim();
  return (body ? JSON.parse(body) : null) as T;
}

interface Page<T> {
  data: T;
  next: string | null;
}

function nextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const re = /<([^>]+)>;\s*rel="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(linkHeader)) !== null) if (m[2] === 'next') return m[1];
  return null;
}

async function getPage<T>(pathOrUrl: string): Promise<Page<T>> {
  const url = resolveApiUrl(pathOrUrl);
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json+canvas-string-ids, application/json' },
    credentials: 'same-origin',
    redirect: 'error',
    cache: 'no-store',
    referrerPolicy: 'same-origin',
  });
  const text = await res.text();
  if (!res.ok) throw new CanvasApiError(`Canvas returned ${res.status}`, res.status);
  return { data: parseCanvasJson<T>(text), next: nextLink(res.headers.get('link')) };
}

export async function canvasGet<T>(path: string): Promise<T> {
  return (await getPage<T>(path)).data;
}

export interface ListResult<T> {
  items: T[];
  /* true if Canvas had more pages than we were willing to read */
  truncated: boolean;
}

/* GET every page of a list endpoint, up to maxPages. A failed first page
   throws; a failed later page returns what loaded, marked truncated. */
export async function canvasGetAll<T>(path: string, maxPages = 25): Promise<ListResult<T>> {
  const items: T[] = [];
  let next: string | null = path;
  const seen = new Set<string>();
  for (let i = 0; next; i++) {
    if (i >= maxPages) return { items, truncated: true };
    let url: string;
    try {
      url = resolveApiUrl(next).toString();
    } catch (err) {
      if (i === 0) throw err;
      return { items, truncated: true };
    }
    if (seen.has(url)) break;
    seen.add(url);
    try {
      const page: Page<T[]> = await getPage<T[]>(url);
      if (!Array.isArray(page.data)) break;
      items.push(...page.data);
      next = page.next;
    } catch (err) {
      if (i === 0) throw err;
      return { items, truncated: true };
    }
  }
  return { items, truncated: false };
}

/* Build a same-origin Canvas page path from digit ids. Every link the panel
   renders goes through here, so a link can only ever point at RJ Canvas. */
export function canvasLink(template: string, ids: Record<string, unknown>): string {
  const path = template.replace(/:(\w+)/g, (_, k: string) => assertId(ids[k]));
  const url = new URL(path, window.location.origin);
  if (url.origin !== window.location.origin) throw new CanvasApiError('Rejected link');
  return url.toString();
}

/* Run tasks with limited parallelism so a teacher with many sections
   doesn't hit Canvas's rate limit. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

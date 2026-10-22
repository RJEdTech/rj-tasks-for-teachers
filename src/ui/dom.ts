/*
  The only way this extension creates DOM. Text always goes in as text nodes,
  never as HTML, so a student name or assignment title like
  "<img src=x onerror=...>" shows up as those characters and can't run.
  Inline event-handler attributes are refused; events are added with
  addEventListener by the caller.
*/
type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | null | undefined>;

const ALLOWED_ATTR = /^(class|id|role|type|title|tabindex|hidden|disabled|href|target|rel|value|selected|for|name|open|lang|aria-[a-z]+|data-[a-z-]+)$/;

export function h(tag: string, attrs: Attrs = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (!ALLOWED_ATTR.test(k)) throw new Error('Refused attribute ' + k);
    if (k === 'href') {
      el.setAttribute('href', safeLink(String(v)));
      continue;
    }
    el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, ...children);
  return el;
}

export function append(el: Node, ...children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

export function clear(el: Node): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/* Links can only point at this Canvas site. */
export function safeLink(href: string): string {
  try {
    const u = new URL(href, window.location.origin);
    return u.origin === window.location.origin && (u.protocol === 'https:' || u.protocol === 'http:')
      ? u.toString()
      : '#';
  } catch {
    return '#';
  }
}

export function plural(n: number, one: string, many = one + 's'): string {
  return `${n} ${n === 1 ? one : many}`;
}

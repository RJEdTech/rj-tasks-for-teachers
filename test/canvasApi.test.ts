import { vi } from 'vitest';
import {
  assertId,
  canvasGet,
  canvasGetAll,
  canvasLink,
  mapLimit,
  resolveApiUrl,
} from '../src/lib/canvasApi';

function respond(body: unknown, link?: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => 'while(1);' + JSON.stringify(body),
    headers: new Headers(link ? { link } : {}),
  } as unknown as Response;
}

afterEach(() => vi.restoreAllMocks());

describe('resolveApiUrl', () => {
  it('allows the listed endpoints', () => {
    for (const p of [
      '/api/v1/courses?per_page=100',
      '/api/v1/courses/123/assignments',
      '/api/v1/courses/123/assignment_groups',
      '/api/v1/courses/123/students/submissions?student_ids[]=all',
      '/api/v1/courses/123/grading_periods',
      '/api/v1/courses/123/users',
      '/api/v1/users/self/todo_item_count',
    ])
      expect(resolveApiUrl(p).pathname).toMatch(/^\/api\/v1\//);
  });

  it('refuses everything else', () => {
    for (const p of [
      '/api/v1/conversations',
      '/api/v1/courses/1/assignments/2/submissions/3', // grading endpoint
      '/api/v1/courses/1/quizzes',
      '/api/graphql',
      '/api/v1/users/self/profile',
      '/api/v1/courses/abc/assignments',
      '/api/v1/courses/1/../../users/self',
      '/login',
      'https://evil.example/api/v1/courses',
      '//evil.example/api/v1/courses',
      'https://user:pw@rjhs.instructure.com/api/v1/courses',
    ])
      expect(() => resolveApiUrl(p), p).toThrow();
  });
});

describe('canvasGet', () => {
  it('sends GET only, same-origin credentials, refuses redirects, strips while(1);', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond({ needs_grading_count: 4 }));
    const r = await canvasGet<{ needs_grading_count: number }>('/api/v1/users/self/todo_item_count');
    expect(r.needs_grading_count).toBe(4);
    const [, init] = f.mock.calls[0];
    expect(init).toMatchObject({ method: 'GET', credentials: 'same-origin', redirect: 'error', cache: 'no-store' });
    expect((init as RequestInit).body).toBeUndefined();
  });

  it('throws on HTTP errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond({}, undefined, 401));
    await expect(canvasGet('/api/v1/courses')).rejects.toThrow('401');
  });
});

describe('canvasGetAll', () => {
  it('follows next links on the same endpoint', async () => {
    const f = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(respond([1, 2], '<https://rjhs.instructure.com/api/v1/courses?page=2>; rel="next"'))
      .mockResolvedValueOnce(respond([3]));
    const r = await canvasGetAll<number>('/api/v1/courses');
    expect(r).toEqual({ items: [1, 2, 3], truncated: false });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('stops (truncated) when a next link leaves the allowed endpoints', async () => {
    const f = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(respond([1], '<https://evil.example/api/v1/courses?page=2>; rel="next"'));
    const r = await canvasGetAll<number>('/api/v1/courses');
    expect(r).toEqual({ items: [1], truncated: true });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('stops at the page limit and says so', async () => {
    let n = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      respond([n], `<https://rjhs.instructure.com/api/v1/courses?page=${++n + 1}>; rel="next"`)
    );
    const r = await canvasGetAll<number>('/api/v1/courses', 3);
    expect(r.items).toHaveLength(3);
    expect(r.truncated).toBe(true);
  });

  it('does not loop on a repeated next link', async () => {
    const f = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(respond([1], '<https://rjhs.instructure.com/api/v1/courses>; rel="next"'));
    await canvasGetAll<number>('/api/v1/courses');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('throws if the first page fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    await expect(canvasGetAll('/api/v1/courses')).rejects.toThrow('offline');
  });
});

describe('ids and links', () => {
  it('assertId accepts digits only', () => {
    expect(assertId('123')).toBe('123');
    expect(assertId(456)).toBe('456');
    for (const bad of ['', '12a', '1/2', '../1', ' 1', null, undefined, '1'.repeat(21)])
      expect(() => assertId(bad as string)).toThrow();
  });

  it('canvasLink builds same-origin links from digit ids only', () => {
    expect(canvasLink('/courses/:c/gradebook/speed_grader?assignment_id=:a', { c: '5', a: '9' })).toBe(
      'https://rjhs.instructure.com/courses/5/gradebook/speed_grader?assignment_id=9'
    );
    expect(() => canvasLink('/courses/:c', { c: '//evil.example' })).toThrow();
  });

  it('mapLimit keeps order and limits parallelism', async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5, 6], 2, async (x) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return x * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50, 60]);
    expect(peak).toBe(2);
  });
});

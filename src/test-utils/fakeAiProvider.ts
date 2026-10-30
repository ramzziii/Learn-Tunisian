// A fake `fetch` for the AI provider: routes by URL path suffix
// ('/chat/completions', '/embeddings', '/audio/speech',
// '/audio/transcriptions') and records every call, so tests can assert a
// paid call did or didn't happen and what was sent.
export type RouteHandler = (init: RequestInit) => Response | Promise<Response>;

export function fakeProvider(routes: Record<string, RouteHandler>) {
  const calls: { path: string; init: RequestInit }[] = [];
  const fetchImpl = async (url: string, init: RequestInit = {}) => {
    const path = Object.keys(routes).find((suffix) => String(url).endsWith(suffix));
    calls.push({ path: path ?? String(url), init });
    if (!path) throw new Error(`unexpected provider call: ${url}`);
    return routes[path](init);
  };
  return {
    fetch: fetchImpl,
    calls,
    callsTo: (suffix: string) => calls.filter((c) => c.path === suffix),
  };
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Never resolves until the request is aborted — a provider that hangs past the timeout. */
export const hang: RouteHandler = (init) =>
  new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });

export const embeddingOk = (tokens = 7) => () => json({ data: [{ embedding: [0.1, 0.2, 0.3] }], usage: { prompt_tokens: tokens, total_tokens: tokens } });

export const chatOk = (raw: string, usage: Record<string, number> | null = { prompt_tokens: 900, completion_tokens: 120, total_tokens: 1020 }) => () =>
  json({ choices: [{ message: { content: raw } }], ...(usage ? { usage } : {}) });

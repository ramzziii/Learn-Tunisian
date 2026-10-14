/**
 * A minimal stand-in for the supabase-js query builder, for data-layer tests
 * that must run without live Supabase credentials (CI). It records every
 * chained call so tests can assert what was written, and answers each query
 * from a per-"table.operation" script — enough to exercise real error paths
 * (RLS denials, constraint violations, 0-row updates) deterministically.
 *
 * Usage (inside a test file):
 *   const mockDb = createFakeSupabase();
 *   jest.mock('@/lib/supabase/client', () => ({ supabase: mockDb.client }));
 *   mockDb.respond('progress.upsert', { data: null, error: null });
 */

export interface FakeResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

export interface RecordedQuery {
  table: string;
  operation: 'select' | 'insert' | 'update' | 'upsert' | 'delete';
  payload?: unknown;
  options?: unknown;
  /** Every filter/modifier call after the operation, in order, e.g. ['eq', 'id', 'v1']. */
  calls: unknown[][];
}

const CHAIN_METHODS = ['eq', 'neq', 'in', 'or', 'gte', 'lte', 'order', 'limit', 'select', 'match', 'is'] as const;

export function createFakeSupabase() {
  const queries: RecordedQuery[] = [];
  const scripts = new Map<string, FakeResult[]>();

  const nextResult = (key: string): FakeResult => {
    const queue = scripts.get(key);
    if (!queue || queue.length === 0) return { data: null, error: null };
    // The last scripted response is sticky, so a single respond() covers repeated calls.
    return queue.length > 1 ? queue.shift()! : queue[0];
  };

  function builder(table: string) {
    let query: RecordedQuery | null = null;

    const start = (operation: RecordedQuery['operation'], payload?: unknown, options?: unknown) => {
      query = { table, operation, payload, options, calls: [] };
      queries.push(query);
      return chain;
    };

    const resolve = () => Promise.resolve(nextResult(`${table}.${query!.operation}`));

    const chain: Record<string, unknown> = {
      then: (onFulfilled: (r: FakeResult) => unknown, onRejected?: (e: unknown) => unknown) =>
        resolve().then(onFulfilled, onRejected),
      single: () => resolve(),
      maybeSingle: () => resolve(),
    };
    for (const method of CHAIN_METHODS) {
      chain[method] = (...args: unknown[]) => {
        query!.calls.push([method, ...args]);
        return chain;
      };
    }

    return {
      select: (...args: unknown[]) => start('select', args[0]),
      insert: (payload: unknown, options?: unknown) => start('insert', payload, options),
      update: (payload: unknown, options?: unknown) => start('update', payload, options),
      upsert: (payload: unknown, options?: unknown) => start('upsert', payload, options),
      delete: () => start('delete'),
    };
  }

  return {
    client: { from: (table: string) => builder(table) },
    /** Script the result(s) for "table.operation"; called in order, the last one repeats. */
    respond(key: string, ...results: FakeResult[]) {
      scripts.set(key, results);
    },
    queries,
    writes: () => queries.filter((q) => q.operation !== 'select'),
    reset() {
      queries.length = 0;
      scripts.clear();
    },
  };
}

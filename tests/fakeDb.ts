import type { Db, DbError } from "../src/lib/sync/syncEngine";

/**
 * In-memory stand-in for Supabase/PostgREST used by the sync tests. It enforces the bits of
 * the real schema the sync engine depends on: upsert-by-id, the one-set-per-number unique key,
 * a foreign key from sets to session exercises, and per-user row scoping.
 */
export class FakeDb implements Db {
  tables = new Map<string, Map<string, Record<string, unknown>>>();
  offline = false;
  requests = 0;
  /** The user the "JWT" belongs to; rows of other users are invisible, like RLS. */
  constructor(public authUser: string) {}

  /** Same database, different signed-in user. */
  as(user: string): FakeDb {
    const other = new FakeDb(user);
    other.tables = this.tables;
    return other;
  }

  private t(name: string) {
    if (!this.tables.has(name)) this.tables.set(name, new Map());
    return this.tables.get(name)!;
  }

  private result<T>(data: T | null, error: DbError | null) {
    this.requests++;
    if (this.offline) return Promise.reject(new TypeError("Failed to fetch"));
    return Promise.resolve({ data, error });
  }

  from(table: string) {
    const rows = this.t(table);
    const owner = (r: Record<string, unknown>) => (r.user_id ?? r.owner_id) as string;
    const visible = () => [...rows.values()].filter((r) => owner(r) === this.authUser);
    return {
      select: () => ({
        eq: (col: string, v: unknown) => {
          const base = () => visible().filter((r) => r[col] === v);
          const p = this.result(base(), null);
          return Object.assign(p, { range: (a: number, b: number) => this.result(base().slice(a, b + 1), null) });
        },
      }),
      upsert: (input: Record<string, unknown>[] | Record<string, unknown>, opts?: { onConflict?: string }) => {
        const list = Array.isArray(input) ? input : [input];
        const key = opts?.onConflict ?? "id";
        for (const r of list) {
          if (owner(r) !== this.authUser) return this.result(null, { message: "new row violates row-level security policy", code: "42501" });
          if (table === "completed_sets") {
            if (!this.t("session_exercises").has(r.session_exercise_id as string))
              return this.result(null, { message: "violates foreign key constraint", code: "23503" });
            const dup = [...rows.values()].find((x) => x.id !== r.id && x.session_exercise_id === r.session_exercise_id && x.set_number === r.set_number);
            if (dup) return this.result(null, { message: "duplicate key value violates unique constraint", code: "23505" });
          }
        }
        for (const r of list) {
          const k = r[key] as string;
          rows.set(k, { ...(rows.get(k) ?? {}), ...r });
        }
        return this.result(null, null);
      },
      delete: () => ({
        in: (col: string, ids: string[]) => {
          for (const [k, r] of rows) if (ids.includes(r[col] as string) && owner(r) === this.authUser) rows.delete(k);
          return this.result(null, null);
        },
      }),
    };
  }
}

import { applyChanges, compactChanges, type Change } from "../domain/changes";
import { DEFAULT_PREFERENCES, emptyAppData, type AppData, type Preferences, type TableName } from "../domain/types";
import { KEYS, type KV } from "../store/persistence";
import { ALL_TABLES, DB_TABLE, fromRow, prefsFromRow, prefsToRow, toRow } from "./mappers";

/**
 * The subset of the Supabase JS client the sync engine uses. Kept structural (and loosely
 * typed) so the engine can be unit-tested against an in-memory fake.
 */
export interface DbError {
  message: string;
  code?: string;
  details?: string;
  status?: number;
}
type Result<T> = PromiseLike<{ data: T | null; error: DbError | null }>;
export interface Db {
  from(table: string): {
    select(columns?: string): {
      eq(col: string, v: unknown): Result<Record<string, unknown>[]> & { range(a: number, b: number): Result<Record<string, unknown>[]> };
    };
    upsert(rows: Record<string, unknown>[] | Record<string, unknown>, opts?: { onConflict?: string }): Result<unknown>;
    delete(): { in(col: string, values: string[]): Result<unknown> };
  };
}

export type FlushOutcome =
  | { ok: true; pushed: number }
  | { ok: false; reason: "network"; message: string; pushed: number }
  | { ok: false; reason: "rejected"; message: string; pushed: number };

/** Errors that will never succeed on retry (constraint / RLS / validation) vs. transient ones. */
export function isPermanent(err: DbError): boolean {
  if (err.status && err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429) return true;
  if (err.code && /^(PGRST|22|23|42)/.test(err.code)) return true;
  return false;
}

const PAGE = 1000;

export class SyncEngine {
  /** Changes not yet sent. */
  private outbox: Change[];
  /** Changes currently being sent (kept separate so new edits are never merged into them). */
  private inflight: Change[] = [];
  private prefsPending: Preferences | null;
  private flushing: Promise<FlushOutcome> | null = null;

  constructor(
    private db: Db,
    private userId: string,
    private kv: KV,
  ) {
    this.outbox = kv.get<Change[]>(KEYS.userOutbox(userId)) ?? [];
    this.prefsPending = kv.get<Preferences>(KEYS.userPrefsPending(userId));
  }

  get pendingCount() {
    return this.inflight.length + this.outbox.length + (this.prefsPending ? 1 : 0);
  }

  private persist() {
    this.kv.set(KEYS.userOutbox(this.userId), [...this.inflight, ...this.outbox]);
  }

  /** Cached copy for instant / offline start-up. */
  readCache(): AppData | null {
    return this.kv.get<AppData>(KEYS.userCache(this.userId));
  }

  writeCache(data: AppData) {
    this.kv.set(KEYS.userCache(this.userId), data);
  }

  enqueue(changes: Change[]) {
    if (!changes.length) return;
    this.outbox = compactChanges([...this.outbox, ...changes]);
    this.persist();
  }

  enqueuePrefs(p: Preferences) {
    this.prefsPending = p;
    this.kv.set(KEYS.userPrefsPending(this.userId), p);
  }

  /** Fetch every table for this user; pending local changes are re-applied on top. */
  async load(): Promise<AppData> {
    const data = emptyAppData();
    const fetchAll = async (table: TableName) => {
      const rows: Record<string, unknown>[] = [];
      const ownerCol = table === "exercises" ? "owner_id" : "user_id";
      for (let from = 0; ; from += PAGE) {
        const { data: page, error } = await this.db.from(DB_TABLE[table]).select("*").eq(ownerCol, this.userId).range(from, from + PAGE - 1);
        if (error) throw Object.assign(new Error(error.message), { db: error });
        rows.push(...(page ?? []));
        if (!page || page.length < PAGE) break;
      }
      return rows;
    };
    const results = await Promise.all(ALL_TABLES.map((t) => fetchAll(t)));
    ALL_TABLES.forEach((t, i) => {
      (data as unknown as Record<string, unknown[]>)[t] = results[i].map((r) => fromRow(t, r));
    });
    const { data: prefRows, error } = await this.db.from("user_preferences").select("*").eq("user_id", this.userId);
    if (error) throw Object.assign(new Error(error.message), { db: error });
    data.preferences = prefRows && prefRows[0] ? prefsFromRow(prefRows[0], DEFAULT_PREFERENCES) : { ...DEFAULT_PREFERENCES };
    if (this.prefsPending) data.preferences = this.prefsPending;
    return applyChanges(data, [...this.inflight, ...this.outbox]);
  }

  /** Push queued changes in order. Concurrent calls share one in-flight flush. */
  flush(): Promise<FlushOutcome> {
    if (!this.flushing) this.flushing = this.doFlush().finally(() => (this.flushing = null));
    return this.flushing;
  }

  private async doFlush(): Promise<FlushOutcome> {
    let pushed = 0;
    let rejected: string | null = null;
    const requeue = () => {
      this.outbox = [...this.inflight, ...this.outbox];
      this.inflight = [];
      this.persist();
    };
    try {
      if (this.prefsPending) {
        const p = this.prefsPending;
        const { error } = await this.db.from("user_preferences").upsert(prefsToRow(p, this.userId), { onConflict: "user_id" });
        if (error && !isPermanent(error)) return { ok: false, reason: "network", message: error.message, pushed };
        if (error) rejected = error.message;
        if (this.prefsPending === p) {
          this.prefsPending = null;
          this.kv.remove(KEYS.userPrefsPending(this.userId));
        }
        pushed++;
      }
      while (this.outbox.length) {
        this.inflight = this.outbox;
        this.outbox = [];
        while (this.inflight.length) {
          // Group consecutive changes of the same table + op into one request.
          const first = this.inflight[0];
          let n = 1;
          while (n < this.inflight.length && n < 200 && this.inflight[n].table === first.table && this.inflight[n].op === first.op) n++;
          const group = this.inflight.slice(0, n);
          const table = DB_TABLE[first.table];
          const { error } =
            first.op === "upsert"
              ? await this.db.from(table).upsert(
                  group.map((c) => toRow(c.table, (c as Extract<Change, { op: "upsert" }>).row, this.userId)),
                  { onConflict: "id" },
                )
              : await this.db.from(table).delete().in("id", group.map((c) => (c as Extract<Change, { op: "delete" }>).id));
          if (error && !isPermanent(error)) {
            requeue();
            return { ok: false, reason: "network", message: error.message, pushed };
          }
          if (error) rejected = error.message; // drop the group so one bad row can't block sync forever
          this.inflight = this.inflight.slice(n);
          this.persist();
          pushed += n;
        }
      }
    } catch (e) {
      requeue();
      return { ok: false, reason: "network", message: e instanceof Error ? e.message : String(e), pushed };
    }
    return rejected ? { ok: false, reason: "rejected", message: rejected, pushed } : { ok: true, pushed };
  }
}

import type { AppData, TableName } from "./types";

/**
 * Every mutation in the app is expressed as a list of row-level changes. The same list is
 * applied to in-memory state, written to localStorage (guests) and queued in the sync
 * outbox (signed-in users) — so there is one code path for all three.
 */
export type Change =
  | { table: TableName; op: "upsert"; row: { id: string } & Record<string, unknown> }
  | { table: TableName; op: "delete"; id: string };

type Row = { id: string };

export function upsert<T extends Row>(table: TableName, row: T): Change {
  return { table, op: "upsert", row: row as unknown as { id: string } & Record<string, unknown> };
}

export function del(table: TableName, id: string): Change {
  return { table, op: "delete", id };
}

export function applyChanges(data: AppData, changes: Change[]): AppData {
  if (changes.length === 0) return data;
  const next: AppData = { ...data };
  const touched = new Set<TableName>();
  for (const c of changes) {
    if (!touched.has(c.table)) {
      // copy-on-write per table
      (next as unknown as Record<string, Row[]>)[c.table] = [...(next[c.table] as Row[])];
      touched.add(c.table);
    }
    const list = next[c.table] as Row[];
    const id = c.op === "upsert" ? c.row.id : c.id;
    const idx = list.findIndex((r) => r.id === id);
    if (c.op === "upsert") {
      if (idx >= 0) list[idx] = { ...list[idx], ...c.row };
      else list.push(c.row);
    } else if (idx >= 0) {
      list.splice(idx, 1);
    }
  }
  return next;
}

/** Collapse a queue so each row only keeps its latest change (used by the outbox). */
export function compactChanges(changes: Change[]): Change[] {
  const latest = new Map<string, { index: number; change: Change }>();
  changes.forEach((c, index) => {
    const id = c.op === "upsert" ? c.row.id : c.id;
    const key = `${c.table}:${id}`;
    const prev = latest.get(key);
    if (prev && prev.change.op === "upsert" && c.op === "upsert") {
      // merge partial upserts, keep position of the first so parents stay before children
      latest.set(key, { index: prev.index, change: { ...c, row: { ...prev.change.row, ...c.row } } });
    } else {
      latest.set(key, { index: prev && c.op === "upsert" ? prev.index : index, change: c });
    }
  });
  return [...latest.values()].sort((a, b) => a.index - b.index).map((v) => v.change);
}

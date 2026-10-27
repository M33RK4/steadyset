import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompletedSet, SessionExercise, WorkoutSession } from "../domain/types";
import { fromRow } from "../sync/mappers";
import { summarizeBuddyWorkout, type Buddy, type BuddyLive } from "./live";

// Thin wrappers around the buddy tables and functions (supabase/migrations/…04_themes_and_buddies.sql).
// Every call runs as the signed-in user; the database's RLS decides what they may see.

export class BuddyError extends Error {
  /** The buddy migration hasn't been run on this Supabase project yet. */
  readonly setupMissing: boolean;
  constructor(message: string, setupMissing = false) {
    super(message);
    this.setupMissing = setupMissing;
  }
}

type PgError = { code?: string; message: string } | null;

function check(error: PgError): void {
  if (!error) return;
  // Unknown function / table: the migration is missing.
  const missing = ["PGRST202", "PGRST205", "42P01", "42883"].includes(error.code ?? "");
  throw new BuddyError(missing ? "Buddies aren't set up on the server yet." : error.message, missing);
}

export async function listBuddies(sb: SupabaseClient): Promise<Buddy[]> {
  const { data, error } = await sb.rpc("my_buddies");
  check(error);
  return ((data ?? []) as { buddy_id: string; display_name: string; connected_at: string }[]).map((r) => ({ id: r.buddy_id, name: r.display_name, connectedAt: r.connected_at }));
}

export async function createInvite(sb: SupabaseClient): Promise<string> {
  const { data, error } = await sb.rpc("create_buddy_invite");
  check(error);
  return data as string;
}

export async function acceptInvite(sb: SupabaseClient, code: string): Promise<string> {
  const { data, error } = await sb.rpc("accept_buddy_invite", { invite_code: code });
  check(error);
  return data as string;
}

export async function removeBuddy(sb: SupabaseClient, me: string, buddyId: string): Promise<void> {
  const [a, b] = me < buddyId ? [me, buddyId] : [buddyId, me];
  const { error } = await sb.from("buddy_links").delete().eq("user_a", a).eq("user_b", b);
  check(error);
}

export async function sendHeart(sb: SupabaseClient, to: string): Promise<void> {
  const { error } = await sb.from("buddy_hearts").insert({ recipient_id: to });
  check(error);
}

export interface HeartRow {
  id: string;
  sender_id: string;
  created_at: string;
}

export async function heartsSince(sb: SupabaseClient, me: string, since: string): Promise<HeartRow[]> {
  const { data, error } = await sb.from("buddy_hearts").select("id, sender_id, created_at").eq("recipient_id", me).gt("created_at", since).order("created_at").limit(50);
  check(error);
  return (data ?? []) as HeartRow[];
}

/** The buddy's most recent session the database lets us see (the last 18 hours), summarised. */
export async function fetchBuddyLive(sb: SupabaseClient, buddyId: string): Promise<BuddyLive> {
  const { data: sessions, error } = await sb.from("workout_sessions").select("*").eq("user_id", buddyId).order("started_at", { ascending: false }).limit(1);
  check(error);
  const row = sessions?.[0];
  if (!row) return summarizeBuddyWorkout(null, [], []);
  const session = fromRow<WorkoutSession>("sessions", row);
  const [ex, sets] = await Promise.all([
    sb.from("session_exercises").select("*").eq("session_id", session.id),
    sb.from("completed_sets").select("*").eq("session_id", session.id),
  ]);
  check(ex.error);
  check(sets.error);
  return summarizeBuddyWorkout(
    session,
    (ex.data ?? []).map((r) => fromRow<SessionExercise>("sessionExercises", r)),
    (sets.data ?? []).map((r) => fromRow<CompletedSet>("sets", r)),
  );
}

/** Normalises what someone typed: "abc 2xy" → "ABC2XY". */
export function cleanInviteCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

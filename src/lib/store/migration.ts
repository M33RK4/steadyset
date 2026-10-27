import { upsert, type Change } from "../domain/changes";
import type { AppData, Plan, TableName } from "../domain/types";
import { ALL_TABLES } from "../sync/mappers";

/** Does the guest have anything worth offering to import (beyond the untouched default plan)? */
export function guestHasMeaningfulData(g: AppData | null): boolean {
  if (!g) return false;
  if (g.sessions.length || g.measurements.length || g.exercises.length || g.overrides.length) return true;
  if (g.plans.length > 1) return true;
  return g.plans.some((p) => p.updatedAt !== p.createdAt || !p.templateKey);
}

/**
 * Build the changes that copy a guest's data into an account. Ids are UUIDs, so they can't
 * collide with existing rows. Imported plans never steal the "active" flag from the account.
 */
export function guestImportChanges(guest: AppData, account: AppData): Change[] {
  const accountHasActive = account.plans.some((p) => p.isActive && !p.archivedAt);
  const names = new Set(account.plans.map((p) => p.name));
  // An untouched copy of a template the account already has would just be a duplicate.
  const skipPlans = new Set(
    guest.plans.filter((p) => p.templateKey && p.updatedAt === p.createdAt && account.plans.some((a) => a.templateKey === p.templateKey)).map((p) => p.id),
  );
  const skipDays = new Set(guest.planDays.filter((d) => skipPlans.has(d.planId)).map((d) => d.id));
  const changes: Change[] = [];
  for (const t of ALL_TABLES) {
    const rows = guest[t] as ({ id: string; planDayId?: string })[];
    for (const row of rows) {
      if (t === "plans" && skipPlans.has(row.id)) continue;
      if (t === "planDays" && skipDays.has(row.id)) continue;
      if (t === "planExercises" && skipDays.has(row.planDayId ?? "")) continue;
      if (t === "overrides" && skipDays.has(row.planDayId ?? "")) continue;
      if (t === "sessions") {
        const s = row as AppData["sessions"][number];
        const unlink = (s.planId && skipPlans.has(s.planId)) || (s.planDayId && skipDays.has(s.planDayId));
        changes.push(upsert("sessions", unlink ? { ...s, planId: null, planDayId: null } : s));
        continue;
      }
      if (t === "plans") {
        const p = row as Plan;
        const name = names.has(p.name) ? `${p.name} (from guest)` : p.name;
        changes.push(upsert("plans", { ...p, name, isActive: accountHasActive ? false : p.isActive }));
      } else changes.push(upsert(t as TableName, row));
    }
  }
  return changes;
}

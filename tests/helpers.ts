import { applyChanges, type Change } from "../src/lib/domain/changes";
import { emptyAppData, type AppData } from "../src/lib/domain/types";
import { BALANCED_TONING_BEGINNER } from "../src/lib/data/defaultPlan";
import { instantiateTemplate } from "../src/lib/plans/planOps";

/** Fresh user data with the default plan active, created a few weeks before `createdAt`. */
export function seededData(createdAt = new Date(2026, 9, 1, 9, 0)): { data: AppData; planId: string } {
  const base = emptyAppData();
  const { changes, planId } = instantiateTemplate(base, BALANCED_TONING_BEGINNER, { makeActive: true, now: createdAt });
  return { data: applyChanges(base, changes), planId };
}

export function apply(data: AppData, changes: Change[]) {
  return applyChanges(data, changes);
}

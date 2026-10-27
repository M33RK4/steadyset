import type { Metadata } from "next";
import { PlanEditor } from "@/features/plans/PlanEditor";

export const metadata: Metadata = { title: "Edit plan" };
export default function Page() {
  return <PlanEditor />;
}

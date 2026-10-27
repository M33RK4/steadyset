import type { Metadata } from "next";
import { WorkoutsScreen } from "@/features/plans/WorkoutsScreen";

export const metadata: Metadata = { title: "My workouts" };
export default function Page() {
  return <WorkoutsScreen />;
}

import type { Metadata } from "next";
import { WorkoutScreen } from "@/features/workout/WorkoutScreen";

export const metadata: Metadata = { title: "Workout" };
export default function Page() {
  return <WorkoutScreen />;
}

import type { Metadata } from "next";
import { ExerciseDetailScreen } from "@/features/library/LibraryScreen";

export const metadata: Metadata = { title: "Exercise" };
export default function Page() {
  return <ExerciseDetailScreen />;
}

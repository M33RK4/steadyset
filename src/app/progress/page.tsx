import type { Metadata } from "next";
import { ProgressScreen } from "@/features/progress/ProgressScreen";

export const metadata: Metadata = { title: "Progress" };
export default function Page() {
  return <ProgressScreen />;
}

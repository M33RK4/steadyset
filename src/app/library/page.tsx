import type { Metadata } from "next";
import { LibraryScreen } from "@/features/library/LibraryScreen";

export const metadata: Metadata = { title: "Exercise library" };
export default function Page() {
  return <LibraryScreen />;
}

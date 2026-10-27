import type { Metadata } from "next";
import { BuddiesScreen } from "@/features/buddies/BuddiesScreen";

export const metadata: Metadata = { title: "Buddies" };
export default function Page() {
  return <BuddiesScreen />;
}

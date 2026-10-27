import type { Metadata } from "next";
import { CallbackScreen } from "@/features/auth/AuthScreens";

export const metadata: Metadata = { title: "Verifying" };
export default function Page() {
  return <CallbackScreen />;
}

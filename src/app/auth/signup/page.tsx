import type { Metadata } from "next";
import { SignupScreen } from "@/features/auth/AuthScreens";

export const metadata: Metadata = { title: "Create account" };
export default function Page() {
  return <SignupScreen />;
}

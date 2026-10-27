import type { Metadata } from "next";
import { LoginScreen } from "@/features/auth/AuthScreens";

export const metadata: Metadata = { title: "Sign in" };
export default function Page() {
  return <LoginScreen />;
}

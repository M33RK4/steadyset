import type { Metadata } from "next";
import { ForgotScreen } from "@/features/auth/AuthScreens";

export const metadata: Metadata = { title: "Reset password" };
export default function Page() {
  return <ForgotScreen />;
}

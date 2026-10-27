import type { Metadata } from "next";
import { UpdatePasswordScreen } from "@/features/auth/AuthScreens";

export const metadata: Metadata = { title: "New password" };
export default function Page() {
  return <UpdatePasswordScreen />;
}

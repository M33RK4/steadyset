"use client";

import type { ReactNode } from "react";
import { AppStoreProvider } from "@/lib/store/AppStore";
import { ConfirmProvider, ToastProvider } from "@/components/ui/Dialog";
import { AppShell } from "@/components/shell/AppShell";
import { BuddiesProvider } from "@/features/buddies/BuddiesProvider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AppStoreProvider>
      <ToastProvider>
        <ConfirmProvider>
          <BuddiesProvider>
            <AppShell>{children}</AppShell>
          </BuddiesProvider>
        </ConfirmProvider>
      </ToastProvider>
    </AppStoreProvider>
  );
}

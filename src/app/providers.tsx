"use client";

import type { ReactNode } from "react";
import { AppStoreProvider } from "@/lib/store/AppStore";
import { ConfirmProvider, ToastProvider } from "@/components/ui/Dialog";
import { AppShell } from "@/components/shell/AppShell";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AppStoreProvider>
      <ToastProvider>
        <ConfirmProvider>
          <AppShell>{children}</AppShell>
        </ConfirmProvider>
      </ToastProvider>
    </AppStoreProvider>
  );
}

"use client";

import type { ReactNode } from "react";
import { AppStoreProvider } from "@/lib/store/AppStore";
import { ConfirmProvider, ToastProvider } from "@/components/ui/Dialog";
import { AppShell } from "@/components/shell/AppShell";
import { BuddiesProvider } from "@/features/buddies/BuddiesProvider";
import { ExerciseSheetProvider } from "@/features/library/ExerciseSheet";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AppStoreProvider>
      <ToastProvider>
        <ConfirmProvider>
          <BuddiesProvider>
            <ExerciseSheetProvider>
              <AppShell>{children}</AppShell>
            </ExerciseSheetProvider>
          </BuddiesProvider>
        </ConfirmProvider>
      </ToastProvider>
    </AppStoreProvider>
  );
}

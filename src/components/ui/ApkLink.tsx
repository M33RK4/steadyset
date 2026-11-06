"use client";

import { useInstallState } from "@/lib/pwa/install";
import { Icon } from "./Icon";
import { cx } from "./primitives";

// The Android app (an APK that opens the live site, so it updates with every deploy). The file is
// served from public/; it's hidden inside the installed app itself.
export const APK_URL = "/steadyset.apk";

export function ApkLink({ className }: { className?: string }) {
  if (useInstallState() === "installed") return null;
  return (
    <a href={APK_URL} download="Steadyset.apk" className={cx("inline-flex items-center gap-1.5 font-semibold text-ink underline underline-offset-2", className)}>
      <Icon name="download" size={16} />
      Download for Android: APK
    </a>
  );
}

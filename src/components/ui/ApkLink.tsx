"use client";

import { APK_URL, useInstallState } from "@/lib/pwa/install";
import { Icon } from "./Icon";
import { cx } from "./primitives";

/** A small "Download for Android" link for places outside Settings. Hidden where it's no use. */
export function ApkLink({ className }: { className?: string }) {
  if (useInstallState() !== "apk") return null;
  return (
    <a href={APK_URL} download="Steadyset.apk" className={cx("inline-flex items-center gap-1.5 font-semibold text-ink underline underline-offset-2", className)}>
      <Icon name="download" size={16} />
      Download for Android: APK
    </a>
  );
}

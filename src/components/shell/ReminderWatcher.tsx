"use client";

import { useEffect } from "react";
import { useApp } from "@/lib/store/AppStore";
import { buildDay, makeContext } from "@/lib/calendar/calendar";
import { todayLocal } from "@/lib/util/dates";
import { browserKV } from "@/lib/store/persistence";
import { showNotification } from "@/lib/audio/alerts";
import { useToast } from "@/components/ui/Dialog";

/**
 * Workout reminders while the app is open (or installed and running in a tab): at the chosen
 * time on a scheduled training day that isn't done yet, show one notification per day.
 * Reminders when the browser is fully closed would need a Web Push server — see README.
 */
export function ReminderWatcher() {
  const { data, prefs, ready } = useApp();
  const toast = useToast();
  useEffect(() => {
    if (!ready || !prefs.remindersEnabled) return;
    const check = () => {
      const today = todayLocal();
      const key = `steadyset:reminded:${today}`;
      if (browserKV.get(key)) return;
      const [h, m] = prefs.reminderTime.split(":").map(Number);
      const now = new Date();
      if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return;
      const day = buildDay(makeContext(data, today), today);
      if (!day.planned || day.planned.kind === "rest" || day.planned.optional || day.status !== "planned") return;
      browserKV.set(key, true);
      const title = `Time for ${day.planned.name}`;
      if (!(document.visibilityState === "hidden" && showNotification(title, "Your workout is scheduled for today.", key))) {
        toast(`${title} — it's on today's schedule.`, { duration: 7000 });
      }
    };
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [ready, prefs.remindersEnabled, prefs.reminderTime, data, toast]);
  return null;
}

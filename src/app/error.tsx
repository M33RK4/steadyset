"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button, buttonClass } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";

/** A screen crashed. The app around it still works, and nothing saved is affected. */
export default function ErrorScreen({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <div className="card p-6 sm:p-8 max-w-md mx-auto mt-6 space-y-4 text-center" role="alert">
      <span className="mx-auto h-14 w-14 rounded-pill bg-accent-soft text-accent-text grid place-items-center">
        <Icon name="alert" size={26} />
      </span>
      <div>
        <h1 className="text-2xl">Something went wrong</h1>
        <p className="text-muted mt-2">This screen ran into a problem. Your workouts and plans are safe.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button icon="undo" onClick={reset}>
          Try again
        </Button>
        <Link href="/" className={buttonClass({ variant: "secondary" })}>
          Back to Today
        </Link>
      </div>
    </div>
  );
}

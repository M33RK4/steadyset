"use client";

import Link from "next/link";
import { useState } from "react";
import { useApp } from "@/lib/store/AppStore";
import { cleanInviteCode } from "@/lib/buddies/api";
import { Button, EmptyState, PageHeader, Skeleton } from "@/components/ui/primitives";
import { useConfirm, useToast } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { liveOf, useBuddies } from "./BuddiesProvider";
import { BuddyLiveCard } from "./BuddyLive";

export function BuddiesScreen() {
  const { mode, configured, prefs } = useApp();
  const b = useBuddies();
  const confirm = useConfirm();
  const toast = useToast();

  const header = (
    <PageHeader
      eyebrow="Train together"
      title={
        <>
          Workout <em>buddies</em>
        </>
      }
      subtitle="Connect with someone to see their workout tick off live, and send hearts to their screen."
    />
  );

  if (mode !== "user") {
    return (
      <div className="max-w-3xl">
        {header}
        <section className="card p-6 space-y-4">
          <h2 className="text-2xl">Buddies need an account</h2>
          <p className="text-muted">
            {configured
              ? "Buddies connect through your Steadyset accounts, so you both need to be signed in. Your guest workouts can come with you when you sign up."
              : "Accounts aren't configured on this deployment yet, so buddies aren't available."}
          </p>
          {configured && (
            <div className="flex flex-wrap gap-2">
              <Link href="/auth/signup" className="btn inline-flex items-center h-11 px-5 rounded-btn bg-accent text-accent-ink font-bold">
                Create account
              </Link>
              <Link href="/auth/login" className="inline-flex items-center h-11 px-5 rounded-btn font-bold hover:bg-raised">
                Sign in
              </Link>
            </div>
          )}
        </section>
      </div>
    );
  }

  if (b.setupMissing) {
    return (
      <div className="max-w-3xl">
        {header}
        <section className="card p-6 space-y-3">
          <h2 className="text-2xl">One more step on the server</h2>
          <p className="text-muted">
            Buddies need the database update in <code className="text-ink font-semibold">supabase/migrations/20261028000004_themes_and_buddies.sql</code>. Run it once in the Supabase SQL editor, then reload this page.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}
      {!prefs.displayName.trim() && (
        <p className="tile px-4 py-3 text-sm flex items-center gap-2">
          <Icon name="info" size={18} className="text-accent-text shrink-0" />
          <span>
            Buddies see the start of your email as your name.{" "}
            <Link href="/settings#display" className="font-bold underline underline-offset-2">
              Set your name
            </Link>{" "}
            to choose what they see.
          </span>
        </p>
      )}

      <ConnectPanel />

      <section aria-labelledby="buddies-h" className="space-y-3">
        <h2 id="buddies-h" className="text-2xl">
          Your buddies
        </h2>
        {b.loading && !b.buddies.length ? (
          <Skeleton className="h-40" />
        ) : b.buddies.length ? (
          <div className="grid gap-4 lg:grid-cols-2 items-start">
            {[...b.buddies]
              .sort((x, y) => Number(liveOf(b.live, y.id).isLive) - Number(liveOf(b.live, x.id).isLive))
              .map((buddy) => (
                <BuddyLiveCard
                  key={buddy.id}
                  name={buddy.name}
                  live={liveOf(b.live, buddy.id)}
                  onHeart={() => b.sendHeart(buddy.id)}
                  onRemove={async () => {
                    const ok = await confirm({
                      title: `Remove ${buddy.name}?`,
                      body: "You'll stop seeing each other's workouts and can't send hearts any more. You can connect again later with a new code.",
                      confirmLabel: "Remove buddy",
                      danger: true,
                    });
                    if (!ok) return;
                    await b.remove(buddy.id).then(
                      () => toast(`${buddy.name} removed`),
                      () => toast("Couldn't remove the buddy — check your connection.", { tone: "error" }),
                    );
                  }}
                />
              ))}
          </div>
        ) : (
          <div className="card">
            <EmptyState icon="user" title="No buddies yet">
              Create a code above and send it to a friend, or enter the code they sent you.
            </EmptyState>
          </div>
        )}
      </section>

      <section className="tile p-5 text-sm text-muted space-y-1.5">
        <p className="font-bold text-ink">What buddies can see</p>
        <p>Only your workout from today: its name, the exercises and which sets you've ticked off — never your older history, plans, weights or measurements. Either of you can remove the connection at any time.</p>
      </section>
    </div>
  );
}

function ConnectPanel() {
  const b = useBuddies();
  const toast = useToast();
  const [code, setCode] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [entry, setEntry] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = cleanInviteCode(entry);

  return (
    <section className="card hero-surface overflow-hidden" aria-label="Connect with a buddy">
      <div className="grid md:grid-cols-2">
        <div className="p-6 space-y-4">
          <div>
            <p className="eyebrow">Step 1 · share</p>
            <h2 className="text-2xl mt-1.5">Invite someone</h2>
            <p className="text-sm text-muted mt-1">Create a code and send it to them. It works once and expires in 2 days.</p>
          </div>
          {code ? (
            <div className="space-y-3">
              <div className="flex gap-1.5" aria-label={`Your code: ${code.split("").join(" ")}`}>
                {code.split("").map((c, i) => (
                  <span key={i} className="num grid place-items-center h-14 w-11 rounded-ctl bg-surface border-2 border-accent text-2xl font-bold text-accent-text anim-pop" style={{ animationDelay: `${i * 40}ms` }}>
                    {c}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon="copy"
                  onClick={async () => {
                    const text = `Let's train together on Steadyset! My buddy code is ${code} — enter it under Buddies.`;
                    try {
                      if (navigator.share) await navigator.share({ text });
                      else {
                        await navigator.clipboard.writeText(text);
                        toast("Invite copied — paste it in a message", { tone: "success" });
                      }
                    } catch {
                      /* share sheet dismissed */
                    }
                  }}
                >
                  Share code
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon="restore"
                  loading={making}
                  onClick={async () => {
                    setMaking(true);
                    setCode(await b.createCode().catch(() => code));
                    setMaking(false);
                  }}
                >
                  New code
                </Button>
              </div>
            </div>
          ) : (
            <Button
              icon="sparkle"
              loading={making}
              onClick={async () => {
                setMaking(true);
                try {
                  setCode(await b.createCode());
                } catch (e) {
                  toast(e instanceof Error ? e.message : "Couldn't create a code.", { tone: "error" });
                } finally {
                  setMaking(false);
                }
              }}
            >
              Create my code
            </Button>
          )}
        </div>

        <form
          className="p-6 space-y-4 border-t md:border-t-0 md:border-l border-line [[data-theme=summit]_&]:border-edge [[data-theme=summit]_&]:border-t-2 md:[[data-theme=summit]_&]:border-t-0 md:[[data-theme=summit]_&]:border-l-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setJoining(true);
            try {
              const buddy = await b.connect(clean);
              setEntry("");
              toast(buddy ? `You're now buddies with ${buddy.name}` : "Connected!", { tone: "success" });
            } catch (err) {
              setError(err instanceof Error ? err.message : "Couldn't connect.");
            } finally {
              setJoining(false);
            }
          }}
        >
          <div>
            <p className="eyebrow">Step 2 · connect</p>
            <h2 className="text-2xl mt-1.5">Got a code?</h2>
            <p className="text-sm text-muted mt-1">Enter the 6 characters your buddy sent you.</p>
          </div>
          <div className="flex gap-2">
            <label htmlFor="buddy-code" className="sr-only">
              Buddy code
            </label>
            <input
              id="buddy-code"
              className="field num text-xl tracking-[0.3em] uppercase"
              placeholder="ABC123"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={9}
              value={entry}
              onChange={(e) => setEntry(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? "buddy-code-error" : undefined}
            />
            <Button type="submit" disabled={clean.length !== 6} loading={joining} className="h-auto">
              Connect
            </Button>
          </div>
          {error && (
            <p id="buddy-code-error" className="text-sm text-danger flex items-center gap-1.5" role="alert">
              <Icon name="alert" size={16} /> {error}
            </p>
          )}
        </form>
      </div>
    </section>
  );
}

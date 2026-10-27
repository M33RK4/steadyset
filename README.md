# Steadyset — workout planner & tracker

A responsive workout app: follow a weekly plan, log every set, rest with a reliable timer, see your
training on a calendar, build your own plans, and sync everything across devices with an email
account.

- **Next.js (App Router) + React + TypeScript**, **Tailwind CSS v4**
- **Supabase** for email auth, Postgres storage, Row Level Security and cross-device sync
- Four themes (Blush, Ember, Paper, Graphite), all features in every theme
- Works without an account (guest mode, stored in the browser) and imports guest data on sign-in

---

## Quick start (local)

Requirements: Node.js 20.9+ (22 LTS recommended).

```bash
npm install
cp .env.example .env.local      # optional: leave empty to run in guest-only mode
npm run dev                     # http://localhost:3000
```

Without Supabase settings the app runs fully in **guest mode** (data in `localStorage`) and the
sign-in pages say accounts aren't configured. Add Supabase (below) to enable accounts and sync.

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | TypeScript check |
| `npm test` | Unit tests: timer, workout flow, calendar, plans, sync engine, guest import |
| `npm run test:db` | Runs all migrations + RLS/data tests on a throwaway local PostgreSQL (needs `initdb`/`pg_ctl`/`psql`, not root) |
| `npm run db:generate-library` | Regenerates the exercise-library migration from `src/lib/data/exercises.ts` |

---

## Supabase setup

1. **Create a project** at <https://supabase.com/dashboard>.
2. **Run the migrations** in order — either paste each file from `supabase/migrations/` into the
   SQL editor, or with the CLI:
   ```bash
   npx supabase link --project-ref <your-ref>
   npx supabase db push
   ```
   - `…01_schema.sql` – tables, constraints, indexes
   - `…02_rls_and_functions.sql` – Row Level Security, new-user trigger, `delete_own_account()`
   - `…03_exercise_library.sql` – the built-in exercise library (generated, same ids as the app)
3. **Environment variables** (`.env.local`, and in your host's settings):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…   # or NEXT_PUBLIC_SUPABASE_ANON_KEY
   ```
   Only the public key is used. **Never** put the `service_role`/secret key in this app — nothing needs it.
4. **Email authentication** (Dashboard → Authentication):
   - *Sign In / Providers → Email*: enable Email, keep **Confirm email** on.
   - *URL Configuration*: set **Site URL** to your production URL and add redirect URLs:
     `http://localhost:3000/**` and `https://<your-domain>/**`.
     The app sends users to `/auth/callback` (email verification) and `/auth/update-password`
     (password reset).
   - *SMTP*: Supabase's built-in mailer is heavily rate-limited and meant for testing. For real
     users, configure a custom SMTP provider (Resend, Postmark, SES, …) under *Emails → SMTP*.
   - The app uses the PKCE flow, so the verification/reset link must be opened **in the same
     browser** where the user signed up / requested the reset (the UI says so). If you want links
     that work on any device, switch the email templates to the `token_hash` style and add a
     verify route — see Supabase's "Email templates" docs.

### How the data is protected
- Every private table has RLS: rows are only visible/writable when `user_id = auth.uid()`.
- Child rows (plan days, plan exercises, schedule changes, sessions, set records) must also point
  at a parent owned by the same user, so nobody can attach data to someone else's plan.
- Built-in exercises (`owner_id is null`) are read-only for users; custom exercises are private.
- `npm run test:db` proves this: a second user can't read, update, delete or attach to the first
  user's rows.

### Account deletion
Settings → *Delete account* calls `public.delete_own_account()`, a `SECURITY DEFINER` function
that can only delete `auth.uid()`. Every table references `auth.users` with `ON DELETE CASCADE`,
so all of the user's rows are removed in the same transaction, then the local copy on the device
is cleared. No service key is involved.

---

## Deploying (Vercel, or any Node host)

1. Push the repo to GitHub and import it in Vercel (framework preset: Next.js).
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `…_ANON_KEY`).
3. Deploy, then add the deployed URL to Supabase *URL Configuration* (Site URL + redirect URL).

Any host that runs `next build && next start` works the same way (Netlify, Render, Railway, a VPS).

---

## How it works

```
src/
  app/                    Routes (thin pages) + layout, global CSS/themes, providers
  components/ui/          Buttons, dialogs, toasts, switches, charts, icons, progress rings
  components/shell/       Navigation (sidebar / bottom bar), theme switcher, banners, reminders
  features/               Screens: dashboard, workout, calendar, library, plans, progress, settings, auth
  features/animation/     Exercise demonstration rig + per-exercise animations
  lib/domain/             Types and the "changes" model (all mutations are row-level changes)
  lib/data/               Exercise library and the default plan template
  lib/plans/              Plan operations (copy template, reset, duplicate, edit, delete)
  lib/session/            Workout flow (start, finish set, undo, skip, finish session)
  lib/timer/              Rest timer state machine + the watcher that fires the alert
  lib/calendar/           Schedule, skip/move, statuses, streaks, weekly summary
  lib/stats/              Progress statistics
  lib/sync/               Supabase sync engine (outbox, offline queue) and column mappers
  lib/store/              React store: guest storage, account cache, guest → account import
  lib/auth/, lib/supabase/  Auth helpers and the browser Supabase client
supabase/migrations/      Schema, RLS, functions, exercise library
supabase/tests/           SQL tests (+ a stub to run them on plain Postgres)
tests/                    Unit tests (node:test via tsx)
```

**One mutation path.** Every action (finish a set, edit a plan, move a workout) produces a list
of row changes. The store applies them to memory, saves them locally, and — when signed in —
puts them in an outbox that is pushed to Supabase. All ids are client-generated UUIDs, so
retries after a network failure are safe upserts.

**Offline.** Signed-in users get a cached copy for instant start-up; edits made offline stay in
the outbox (persisted) and sync when the connection returns. The sync status is shown in the
sidebar/top bar.

**Rest timer.** The timer stores an absolute end timestamp, never a tick count, so it is right
after the tab was in the background, the phone slept, or the page was reloaded. Completion is
checked by an exact timeout, a 1-second safety interval and on tab focus; a persisted `alerted`
flag makes the ding play exactly once. The ding is synthesised with Web Audio (no audio file);
browsers only allow sound after a tap, which the app captures when you start/finish a set.

**History is never rewritten.** Sessions store snapshots (title, plan name, exercise names and
targets). Editing a plan only changes future workouts; deleting a plan keeps every completed
workout (the link is set to null). A day only shows as completed when a session was logged —
never because the date passed.

**Calendar dates** are local `YYYY-MM-DD` strings computed from the device's time zone, so a late
evening workout never lands on the next day.

**Workout flow rules.** No rest timer after the final set of an exercise (you can start one on
purpose); double-taps can't record a set twice; the big button that appears where you just
tapped ignores taps for a moment; leaving the workout screen keeps the session in progress and a
banner offers to resume it; "Finish" saves as *completed* only if every exercise was done,
otherwise as *partial*; a session with nothing recorded can be discarded.

### Exercise demonstrations
Each exercise has an original illustrated animation (`src/features/animation/library.ts`), drawn
with a small 2D rig with inverse kinematics, showing the equipment and the direction of movement.
There is a play/pause button and a **Steps** view (start → finish frames with a cue); people with
reduced motion get the steps view by default. No third-party GIFs or videos are embedded, so
there are no licensing issues.

To add better media later (licensed video, Lottie, etc.), put the files in `public/` and render
them in `ExerciseDemo` when present, keeping the illustration as the fallback.

---

## Testing

- `npm test` — 30 unit tests covering the timer (absolute timing, pause/resume, reload,
  single alert, stale alerts), the workout flow (snapshotting, rest after sets but not after the
  last one, double-tap protection, undo, skip, partial vs complete, cardio without strength sets,
  discard), calendar (local dates across DST, statuses, streaks, skip/move without touching
  history), plans (edit/delete keep history, duplicate, activate, reset to template, non-5-day
  plans), sync (cross-device load, offline queue surviving restarts, idempotent retries, rejected
  rows not blocking the queue, user isolation, edits during an in-flight sync) and guest import.
- `npm run test:db` — runs the real migrations on PostgreSQL and checks RLS isolation, the
  one-record-per-set constraint, history surviving plan deletion and complete account deletion.

---

## Known limitations

- **Reminders** fire while Steadyset is open in a tab (or an installed tab). Reminders with the
  browser fully closed need Web Push with a server and a service worker — not included.
- **Background sound:** some mobile browsers suspend audio in background tabs. Enable browser
  notifications in Settings to also get a system notification when rest ends in the background.
- **Live sync** happens on load, on focus and after each change (with a 30-second retry while
  changes are pending) — not via realtime subscriptions. If you edit the same plan on two devices
  at the same moment, the last save wins.
- Exercise reordering in the plan editor uses up/down buttons (keyboard accessible) rather than
  drag and drop.

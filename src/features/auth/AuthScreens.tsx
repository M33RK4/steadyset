"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useApp } from "@/lib/store/AppStore";
import { passwordProblems, requestPasswordReset, resendVerification, signIn, signUp, updatePassword, validateEmail } from "@/lib/auth/auth";
import { getSupabase } from "@/lib/supabase/client";
import { Button, Field, Spinner } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";

function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="min-h-dvh grid place-items-center px-4 py-10 hero-surface">
      <div className="w-full max-w-md space-y-5">
        <Link href="/" className="flex items-center gap-2 justify-center">
          <span className="h-9 w-9 rounded-[10px] bg-accent text-accent-ink grid place-items-center" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <path d="M4 15h4M10 11v8M14 7v12M18 11v4" />
            </svg>
          </span>
          <span className="brand text-2xl">Steadyset</span>
        </Link>
        <main className="card p-6 sm:p-8 space-y-5">
          <header>
            <h1 className="text-2xl">{title}</h1>
            {subtitle && <p className="text-muted mt-1">{subtitle}</p>}
          </header>
          {children}
        </main>
        {footer && <div className="text-center text-sm text-muted">{footer}</div>}
      </div>
    </div>
  );
}

function Notice({ tone, children }: { tone: "error" | "success" | "info"; children: ReactNode }) {
  const cls = tone === "error" ? "bg-danger-soft text-danger" : tone === "success" ? "bg-done-soft text-done" : "bg-raised text-ink";
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-ctl px-4 py-3 text-sm flex gap-2 ${cls}`}>
      <Icon name={tone === "error" ? "alert" : tone === "success" ? "check" : "info"} size={18} className="shrink-0 mt-0.5" />
      <div>{children}</div>
    </div>
  );
}

function NotConfigured() {
  return (
    <Notice tone="info">
      Accounts aren't set up on this deployment yet (missing Supabase settings). You can still use Steadyset as a guest — your data stays in this browser. <Link href="/" className="underline font-semibold">Continue as guest</Link>
    </Notice>
  );
}

/** Redirect away from auth pages once signed in. */
function useRedirectIfSignedIn(to = "/") {
  const { mode, ready } = useApp();
  const router = useRouter();
  useEffect(() => {
    if (ready && mode === "user") router.replace(to);
  }, [mode, ready, router, to]);
}

export function LoginScreen() {
  const { configured } = useApp();
  useRedirectIfSignedIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const router = useRouter();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!validateEmail(email)) return setError({ message: "Enter a valid email address." });
    if (!password) return setError({ message: "Enter your password." });
    setBusy(true);
    const r = await signIn(email.trim(), password);
    setBusy(false);
    if (!r.ok) return setError({ message: r.message, code: r.code });
    router.replace("/");
  };

  return (
    <AuthCard
      title="Sign in"
      subtitle="Your plans and workouts, on every device."
      footer={
        <>
          New here?{" "}
          <Link href="/auth/signup" className="font-semibold text-ink underline underline-offset-2">
            Create an account
          </Link>{" "}
          · <Link href="/" className="underline underline-offset-2">Continue as guest</Link>
        </>
      }
    >
      {!configured && <NotConfigured />}
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && (
          <Notice tone="error">
            {error.message}
            {error.code === "email_not_confirmed" && (
              <button
                type="button"
                className="block mt-1 font-semibold underline"
                onClick={async () => {
                  const r = await resendVerification(email.trim());
                  setError(null);
                  setInfo(r.ok ? r.message ?? "Verification email sent." : r.message);
                }}
              >
                Send the verification email again
              </button>
            )}
          </Notice>
        )}
        {info && <Notice tone="success">{info}</Notice>}
        <Field label="Email">{(id) => <input id={id} type="email" autoComplete="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={!configured} />}</Field>
        <Field label="Password">
          {(id) => <input id={id} type="password" autoComplete="current-password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={!configured} />}
        </Field>
        <div className="flex justify-end -mt-1">
          <Link href="/auth/forgot" className="text-sm font-semibold underline underline-offset-2">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" block loading={busy} disabled={!configured}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthCard>
  );
}

export function SignupScreen() {
  const { configured } = useApp();
  useRedirectIfSignedIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const router = useRouter();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validateEmail(email)) return setError("Enter a valid email address.");
    const pw = passwordProblems(password);
    if (pw) return setError(pw);
    if (password !== confirm) return setError("The passwords don't match.");
    setBusy(true);
    const r = await signUp(email.trim(), password);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    if (r.message) setSent(r.message);
    else router.replace("/");
  };

  if (sent)
    return (
      <AuthCard title="Check your inbox" subtitle={<>We sent a verification link to <strong className="text-ink">{email}</strong>.</>}>
        <p className="text-muted">Open the link on this device to finish creating your account. It can take a minute to arrive — check your spam folder too.</p>
        <Button
          variant="secondary"
          block
          onClick={async () => {
            const r = await resendVerification(email.trim());
            setSent(r.ok ? "Verification email sent again." : r.message);
          }}
        >
          Resend the email
        </Button>
        <Link href="/auth/login" className="block text-center font-semibold underline underline-offset-2">
          Back to sign in
        </Link>
      </AuthCard>
    );

  return (
    <AuthCard
      title="Create your account"
      subtitle="Back up your training and use it on your phone, tablet and laptop."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/auth/login" className="font-semibold text-ink underline underline-offset-2">
            Sign in
          </Link>
        </>
      }
    >
      {!configured && <NotConfigured />}
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="Email">{(id) => <input id={id} type="email" autoComplete="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!configured} />}</Field>
        <Field label="Password" hint="At least 8 characters, with letters and numbers.">
          {(id) => <input id={id} type="password" autoComplete="new-password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} disabled={!configured} />}
        </Field>
        <Field label="Confirm password">
          {(id) => <input id={id} type="password" autoComplete="new-password" className="field" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={!configured} />}
        </Field>
        <Button type="submit" size="lg" block loading={busy} disabled={!configured}>
          {busy ? "Creating account…" : "Create account"}
        </Button>
        <p className="text-xs text-muted">If you've been using Steadyset as a guest on this device, you can import that data after you sign in.</p>
      </form>
    </AuthCard>
  );
}

export function ForgotScreen() {
  const { configured } = useApp();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validateEmail(email)) return setMsg({ tone: "error", text: "Enter a valid email address." });
    setBusy(true);
    const r = await requestPasswordReset(email.trim());
    setBusy(false);
    setMsg({ tone: r.ok ? "success" : "error", text: r.message ?? "" });
  };
  return (
    <AuthCard title="Reset your password" subtitle="We'll email you a link to choose a new one." footer={<Link href="/auth/login" className="underline underline-offset-2">Back to sign in</Link>}>
      {!configured && <NotConfigured />}
      <form onSubmit={submit} className="space-y-4" noValidate>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <Field label="Email">{(id) => <input id={id} type="email" autoComplete="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!configured} />}</Field>
        <Button type="submit" size="lg" block loading={busy} disabled={!configured}>
          Send reset link
        </Button>
      </form>
    </AuthCard>
  );
}

export function UpdatePasswordScreen() {
  const { mode, ready } = useApp();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 4000);
    return () => clearTimeout(t);
  }, []);
  const signedIn = ready && mode === "user";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const pw = passwordProblems(password);
    if (pw) return setError(pw);
    if (password !== confirm) return setError("The passwords don't match.");
    setBusy(true);
    const r = await updatePassword(password);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    router.replace("/");
  };

  if (!signedIn)
    return (
      <AuthCard title="Choose a new password">
        {waited ? (
          <Notice tone="error">
            This reset link is invalid or has expired. <Link href="/auth/forgot" className="underline font-semibold">Request a new one</Link>.
          </Notice>
        ) : (
          <p className="flex items-center gap-2 text-muted">
            <Spinner /> Checking your reset link…
          </p>
        )}
      </AuthCard>
    );

  return (
    <AuthCard title="Choose a new password">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="New password" hint="At least 8 characters, with letters and numbers.">
          {(id) => <input id={id} type="password" autoComplete="new-password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Field label="Confirm new password">{(id) => <input id={id} type="password" autoComplete="new-password" className="field" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}</Field>
        <Button type="submit" size="lg" block loading={busy}>
          Save new password
        </Button>
      </form>
    </AuthCard>
  );
}

/** Landing page for the email verification link. supabase-js exchanges the code automatically. */
export function CallbackScreen() {
  const { mode, ready } = useApp();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search + "&" + window.location.hash.slice(1));
    const desc = params.get("error_description");
    if (desc) setError(desc.replace(/\+/g, " "));
    else if (!getSupabase()) setError("Accounts aren't configured on this deployment.");
  }, []);
  useEffect(() => {
    if (ready && mode === "user") router.replace("/");
  }, [ready, mode, router]);
  useEffect(() => {
    const t = setTimeout(() => setError((e) => e ?? "We couldn't verify this link. It may have expired or already been used — try signing in."), 8000);
    return () => clearTimeout(t);
  }, []);
  return (
    <AuthCard title={error ? "Verification problem" : "Verifying your email"}>
      {error ? (
        <>
          <Notice tone="error">{error}</Notice>
          <Link href="/auth/login" className="block text-center font-semibold underline">
            Go to sign in
          </Link>
        </>
      ) : (
        <p className="flex items-center gap-2 text-muted">
          <Spinner /> Signing you in…
        </p>
      )}
    </AuthCard>
  );
}

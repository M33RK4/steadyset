import { getSupabase } from "../supabase/client";

export type AuthResult = { ok: true; message?: string } | { ok: false; message: string; code?: string };

/** Turn Supabase / network errors into messages a person can act on. */
export function friendlyAuthError(err: unknown): { message: string; code?: string } {
  const e = err as { message?: string; code?: string; status?: number; name?: string } | null;
  const msg = e?.message ?? String(err);
  const code = e?.code;
  if (!navigatorOnline() || /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(msg) || e?.name === "AuthRetryableFetchError") {
    return { message: "Can't reach the server. Check your internet connection and try again.", code: "network" };
  }
  if (code === "invalid_credentials" || /invalid login credentials/i.test(msg)) return { message: "That email and password don't match. Check them and try again.", code: "invalid_credentials" };
  if (code === "email_not_confirmed" || /email not confirmed/i.test(msg))
    return { message: "Please verify your email first — check your inbox for the confirmation link.", code: "email_not_confirmed" };
  if (code === "user_already_exists" || /already registered|already exists/i.test(msg)) return { message: "An account with this email already exists. Try signing in instead.", code: "user_already_exists" };
  if (code === "weak_password" || /password should be|weak password/i.test(msg)) return { message: "Choose a stronger password (at least 8 characters).", code: "weak_password" };
  if (code === "over_email_send_rate_limit" || /rate limit|too many/i.test(msg)) return { message: "Too many attempts. Please wait a minute and try again.", code: "rate_limited" };
  if (code === "same_password") return { message: "Your new password must be different from the old one.", code };
  if (/invalid email|unable to validate email/i.test(msg)) return { message: "That doesn't look like a valid email address.", code: "invalid_email" };
  return { message: msg || "Something went wrong. Please try again.", code };
}

function navigatorOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

function origin() {
  return typeof window === "undefined" ? "" : window.location.origin;
}

function notConfigured(): AuthResult {
  return { ok: false, message: "Accounts aren't configured on this deployment yet. You can keep using guest mode.", code: "not_configured" };
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return notConfigured();
  try {
    const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: `${origin()}/auth/callback` } });
    if (error) return { ok: false, ...friendlyAuthError(error) };
    // With email confirmation on, Supabase returns a user with no identities for an existing email.
    if (data.user && data.user.identities && data.user.identities.length === 0)
      return { ok: false, message: "An account with this email already exists. Try signing in instead.", code: "user_already_exists" };
    if (!data.session) return { ok: true, message: "Check your inbox — we sent you a link to verify your email." };
    return { ok: true };
  } catch (e) {
    return { ok: false, ...friendlyAuthError(e) };
  }
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return notConfigured();
  try {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    return error ? { ok: false, ...friendlyAuthError(error) } : { ok: true };
  } catch (e) {
    return { ok: false, ...friendlyAuthError(e) };
  }
}

export async function resendVerification(email: string): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return notConfigured();
  try {
    const { error } = await sb.auth.resend({ type: "signup", email, options: { emailRedirectTo: `${origin()}/auth/callback` } });
    return error ? { ok: false, ...friendlyAuthError(error) } : { ok: true, message: "Verification email sent again." };
  } catch (e) {
    return { ok: false, ...friendlyAuthError(e) };
  }
}

export async function requestPasswordReset(email: string): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return notConfigured();
  try {
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${origin()}/auth/update-password` });
    // Same message whether or not the email exists, so accounts can't be enumerated.
    return error ? { ok: false, ...friendlyAuthError(error) } : { ok: true, message: "If an account exists for that email, a reset link is on its way." };
  } catch (e) {
    return { ok: false, ...friendlyAuthError(e) };
  }
}

export async function updatePassword(password: string): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return notConfigured();
  try {
    const { error } = await sb.auth.updateUser({ password });
    return error ? { ok: false, ...friendlyAuthError(error) } : { ok: true, message: "Password updated." };
  } catch (e) {
    return { ok: false, ...friendlyAuthError(e) };
  }
}

export async function signOut(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    await sb.auth.signOut();
  } catch {
    /* signing out locally still clears the session */
  }
}

/** Permanently deletes the signed-in account and all its data (see delete_own_account()). */
export async function deleteAccount(): Promise<AuthResult> {
  const sb = getSupabase();
  if (!sb) return notConfigured();
  try {
    const { error } = await sb.rpc("delete_own_account");
    if (error) return { ok: false, ...friendlyAuthError(error) };
    await sb.auth.signOut({ scope: "local" });
    return { ok: true };
  } catch (e) {
    return { ok: false, ...friendlyAuthError(e) };
  }
}

export function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export function passwordProblems(pw: string): string | null {
  if (pw.length < 8) return "Use at least 8 characters.";
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return "Use a mix of letters and numbers.";
  return null;
}

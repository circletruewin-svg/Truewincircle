// Helpers shared between admin's "Master Management" tab and the
// master-side panel. Keeps the few rules of how master accounts work
// in one file so the Firestore rules, signup flow and admin UI can
// stay aligned.

// Unique short code stamped on every master account, used in the
// referral link `?m=<code>`. 8 chars from a vowel-free alphabet so
// it's hard to confuse 0 / O or 1 / I. Phone-shareable.
const CODE_ALPHABET = "23456789BCDFGHJKLMNPQRSTVWXYZ";
export function generateMasterCode() {
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

// `master.balance` is the "points to distribute" pool. When admin
// tops up a master, this goes up. When the master approves a
// deposit or manually credits a player, this goes down. Game wins /
// losses never touch this — the house absorbs those, by design.
export const MASTER_BALANCE_FIELDS = Object.freeze({
  available: "balance",
});

// Build the share link a master can drop into WhatsApp etc. Picks
// up the current origin so it works on staging / vercel previews
// without us hard-coding "truewincircle.in".
export function buildMasterReferralLink(masterCode, origin) {
  const base = origin || (typeof window !== "undefined" ? window.location.origin : "");
  return `${base.replace(/\/$/, "")}/?m=${masterCode}`;
}

// localStorage key used to remember "this visitor came in via a
// master's link" across page loads (capture on landing → apply
// after OTP success).
export const PENDING_MASTER_KEY = "pendingMasterCode";

// Stamp / read / clear helpers so callers don't sprinkle raw
// localStorage access everywhere.
export function rememberMasterCode(code) {
  if (!code || typeof window === "undefined") return;
  try { window.localStorage.setItem(PENDING_MASTER_KEY, String(code).toUpperCase()); } catch {}
}
export function readPendingMasterCode() {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(PENDING_MASTER_KEY) || null; } catch { return null; }
}
export function clearPendingMasterCode() {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(PENDING_MASTER_KEY); } catch {}
}

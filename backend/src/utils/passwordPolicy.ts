import { COMMON_PASSWORDS } from "../config/commonPasswords";
import { CONTEXT_WORDS } from "../config/contextWords";
import { isBreachedPassword } from "./breachedPasswords";

export const MIN_PASSWORD_LENGTH = 8;
/**
 * At least 64 characters must be allowed (ASVS 6.2.9). Passwords are pre-hashed with
 * HMAC-SHA256 before bcrypt (models/User), so bcrypt's 72-byte cut-off no longer limits
 * them; this cap only stops absurd inputs from costing CPU.
 */
export const MAX_PASSWORD_LENGTH = 128;
/**
 * bcrypt only reads the first 72 bytes of a password and silently drops the rest (ASVS
 * 6.2.8). Hashes made before pre-hashing (legacy, `$2b$…` without the `v2$` prefix) are
 * still checked as bcrypt of the raw password, so a longer candidate is refused for them.
 */
export const MAX_PASSWORD_BYTES = 72;

export function passwordByteLength(password: string): number {
  return Buffer.byteLength(password, "utf8");
}

/** Who the password is for, so it can't just be their own name. */
export interface PasswordContext {
  email?: string | null;
  displayName?: string | null;
}

/** The letters (and Thai vowel/tone marks) only, lowercased. */
function lettersOnly(password: string): string {
  return password.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{M}]/gu, "");
}

/** The same after undoing common letter-for-digit swaps (p4ssw0rd → password). */
function unLeet(password: string): string {
  const swapped = password
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[0@4]/g, (c) => (c === "0" ? "o" : "a"))
    .replace(/[1!|]/g, "i")
    .replace(/3/g, "e")
    .replace(/[5$]/g, "s")
    .replace(/7/g, "t");
  return lettersOnly(swapped);
}

const WORDS = [...new Set(CONTEXT_WORDS.map(lettersOnly))].filter(Boolean);

/** Whether `letters` is nothing but context words run together ("torcheckerbangkok"). */
function onlyContextWords(letters: string): boolean {
  if (!letters) return false;
  const ok: boolean[] = new Array(letters.length + 1).fill(false);
  ok[0] = true;
  for (let i = 0; i < letters.length; i++) {
    if (!ok[i]) continue;
    for (const w of WORDS) if (letters.startsWith(w, i)) ok[i + w.length] = true;
  }
  return ok[letters.length]!;
}

/** Why a password built from context-specific words is refused, or null (ASVS 6.2.11). */
function contextProblem(password: string, context: PasswordContext): string | null {
  const letters = lettersOnly(password);
  // "TorChecker2026!": the digits and symbols are padding. "t0rch3ck3r": they are letters.
  if (onlyContextWords(letters) || onlyContextWords(unLeet(password))) return "This password is too easy to guess for this site. Please choose another one";
  const own = [context.email?.split("@")[0], context.displayName]
    .map((v) => (v ? lettersOnly(v) : ""))
    .filter((v) => v.length >= 4);
  if (own.some((v) => letters.includes(v))) return "Please don't use your name or email in your password";
  return null;
}

/**
 * Why a new password is not allowed, or null when it is fine. Used when a password is
 * set (register, reset, change), never on login. No composition rules on purpose
 * (ASVS 6.2.5): any characters are fine, only length, commonness and guessability matter.
 */
export function passwordProblem(password: unknown, context: PasswordContext = {}): string | null {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Password is too long (at most ${MAX_PASSWORD_LENGTH} characters)`;
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return "This password is too common. Please choose a less predictable one";
  }
  return contextProblem(password, context);
}

/**
 * passwordProblem plus a check against passwords known from data breaches (ASVS 6.2.12),
 * which needs a network call. Use this wherever a new password is chosen.
 */
export async function newPasswordProblem(password: unknown, context: PasswordContext = {}): Promise<string | null> {
  const problem = passwordProblem(password, context);
  if (problem) return problem;
  if (await isBreachedPassword(password as string)) {
    return "This password has appeared in a data breach. Please choose a different one";
  }
  return null;
}

import { COMMON_PASSWORDS } from "../config/commonPasswords";

export const MIN_PASSWORD_LENGTH = 8;
/**
 * bcrypt only reads the first 72 bytes of a password and silently drops the rest, so a
 * longer one would be checked truncated (ASVS 6.2.8). We refuse them instead. 72 bytes
 * is 72 English characters, or 24 Thai characters (3 bytes each in UTF-8).
 */
export const MAX_PASSWORD_BYTES = 72;

export function passwordByteLength(password: string): number {
  return Buffer.byteLength(password, "utf8");
}

/**
 * Why a new password is not allowed, or null when it is fine. Used when a password is
 * set (register, reset, change), never on login. No composition rules on purpose
 * (ASVS 6.2.5): any characters are fine, only length and commonness matter.
 */
export function passwordProblem(password: unknown): string | null {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (passwordByteLength(password) > MAX_PASSWORD_BYTES) {
    return `Password is too long (at most ${MAX_PASSWORD_BYTES} bytes, about 24 Thai or 72 English characters)`;
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return "This password is too common. Please choose a less predictable one";
  }
  return null;
}

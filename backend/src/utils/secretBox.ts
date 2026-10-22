import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Authenticated encryption for secrets the server must read back, e.g. TOTP seeds
 * (ASVS 11.3.3, 13.3.1): AES-256-GCM with a random 96-bit IV per value. The output is
 * versioned (`v1:iv:tag:ciphertext`, base64url), so the algorithm or key can change later
 * and old values still decrypt (11.2.2, crypto agility).
 *
 * The key is MFA_ENCRYPTION_KEY: 32 random bytes as 64 hex characters
 * (`openssl rand -hex 32`), kept in Secret Manager in production, where the server
 * refuses to start without it. Elsewhere (local dev, tests) a key is derived from
 * JWT_SECRET with HKDF so nobody has to set one up.
 */
const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";

export function hasDedicatedKey(): boolean {
  return /^[0-9a-f]{64}$/i.test(process.env.MFA_ENCRYPTION_KEY ?? "");
}

function key(): Buffer {
  if (hasDedicatedKey()) return Buffer.from(process.env.MFA_ENCRYPTION_KEY!, "hex");
  if (process.env.NODE_ENV === "production") throw new Error("MFA_ENCRYPTION_KEY must be set in production");
  const base = process.env.JWT_SECRET;
  if (!base) throw new Error("JWT_SECRET is not set");
  return Buffer.from(hkdfSync("sha256", base, "tor-checker", "secret-box v1 (dev only)", 32));
}

export function seal(plaintext: Buffer, associatedData = ""): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  cipher.setAAD(Buffer.from(associatedData));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(":");
}

/**
 * Decrypt a value from seal(). `associatedData` must match the one it was sealed with
 * (we use the user id, so a seed copied onto another account fails to open). Throws if
 * the value was tampered with.
 */
export function open(sealed: string, associatedData = ""): Buffer {
  const [version, iv, tag, ciphertext] = sealed.split(":");
  if (version !== VERSION || !iv || !tag || ciphertext === undefined) throw new Error("Unknown sealed format");
  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(associatedData));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]);
}

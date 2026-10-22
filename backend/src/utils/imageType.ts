/** The image types we accept for avatars, identified by their content. */
export type ImageType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

function startsWith(buf: Buffer, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buf[offset + i] === b);
}

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/**
 * Detect an image's real type from its first bytes ("magic bytes"), ignoring the
 * file name and the Content-Type the client claimed (ASVS 5.2.2). Returns null for
 * anything that isn't a JPEG, PNG, WebP or GIF, e.g. HTML or SVG renamed to .png.
 */
export function detectImageType(buf: Buffer): ImageType | null {
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(buf, ascii("GIF87a")) || startsWith(buf, ascii("GIF89a"))) return "image/gif";
  if (startsWith(buf, ascii("RIFF")) && startsWith(buf, ascii("WEBP"), 8)) return "image/webp";
  return null;
}

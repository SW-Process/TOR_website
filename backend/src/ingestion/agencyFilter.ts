export function parseAgencyAllowlist(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const raw = env.INGEST_AGENCIES ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  );
}

export function isAgencyAllowed(
  name: string | null | undefined,
  allow: Set<string>
): boolean {
  if (allow.size === 0) return true;
  return typeof name === "string" && allow.has(name.trim());
}

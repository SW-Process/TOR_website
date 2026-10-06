/** `CAPTURE_AGENCIES`: comma-separated names a captured project's body/unit must contain; empty = allow all. */
export function captureAgencies(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.CAPTURE_AGENCIES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** True when `list` is empty, or some entry is contained in one of the names. */
export function agencyMatches(list: string[], ...names: Array<string | null | undefined>): boolean {
  if (list.length === 0) return true;
  return list.some((entry) => names.some((n) => typeof n === "string" && n.includes(entry)));
}

/** An absolute link into the frontend (CLIENT_ORIGIN), for redirects and emailed links. */
export function clientUrl(path: string): string {
  const base = process.env.CLIENT_ORIGIN || "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${path}`;
}

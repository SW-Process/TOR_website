/**
 * Common spellings of the same technology, so a vendor's "ReactJS" matches a
 * TOR's "React" (and "Node.js" matches "node"). Keys are the canonical name;
 * values are the other spellings people write.
 *
 * Matching compares canonical forms only: case, spaces, dots, hyphens and
 * underscores are ignored, so "Node.js" and "nodejs" are the same. Keep the
 * aliases to unambiguous names: a short word that is also common English
 * ("go", "next") is only safe because it is only compared inside tech lists.
 */
export const TECH_ALIASES: Record<string, readonly string[]> = {
  react: ["reactjs", "react.js"],
  nodejs: ["node", "node.js"],
  vuejs: ["vue", "vue.js"],
  nextjs: ["next", "next.js"],
  angular: ["angularjs"],
  javascript: ["js", "ecmascript"],
  typescript: ["ts"],
  postgresql: ["postgres", "psql"],
  mongodb: ["mongo"],
  mssql: ["sqlserver", "microsoftsqlserver"],
  kubernetes: ["k8s"],
  golang: ["go"],
  csharp: ["c#", "c sharp"],
  cplusplus: ["c++"],
};

/** Lowercase and drop separators, so "Node.js", "node-js" and "NODE JS" compare equal. */
export function techKey(value: string): string {
  return value.toLowerCase().replace(/[\s._-]+/g, "");
}

const CANONICAL_BY_KEY = new Map<string, string>();
for (const [canonical, aliases] of Object.entries(TECH_ALIASES)) {
  CANONICAL_BY_KEY.set(techKey(canonical), techKey(canonical));
  for (const alias of aliases) CANONICAL_BY_KEY.set(techKey(alias), techKey(canonical));
}

/** The comparison form of a technology name: its canonical key if it has aliases, else its key. */
export function canonicalTech(value: string): string {
  const key = techKey(value);
  return CANONICAL_BY_KEY.get(key) ?? key;
}

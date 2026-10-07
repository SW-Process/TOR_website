/**
 * Removes the procurement-METHOD clause ("ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์ (e-bidding)", e-market, ...) from a
 * process5 title. Nearly every title ends with it, and "อิเล็กทรอนิกส์" in it describes how the buying is done,
 * not what is bought, so the software keyword gate must not see it. Used for gating only; stored titles are untouched.
 */
const METHOD_CLAUSE = /\s*ด้วยวิธี[^()]{0,40}?อิเล็กทรอนิกส์\s*(?:\(\s*e[-\s]?[a-z]+\s*\))?/gi;
const DANGLING_MAX = 60;

export function stripProcurementMethod(title: string): string {
  let out = (title ?? "").replace(METHOD_CLAUSE, "");
  // A truncated hint can cut the clause mid-phrase: drop a short, digit-free tail from the last "ด้วยวิธี".
  const at = out.lastIndexOf("ด้วยวิธี");
  if (at >= 0) {
    const tail = out.slice(at);
    if (tail.length <= DANGLING_MAX && !/\d/.test(tail)) out = out.slice(0, at);
  }
  return out.trim();
}

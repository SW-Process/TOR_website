/**
 * Words that make an easy-to-guess password for this site in particular (ASVS 6.1.2):
 * the product, the city and agency it covers, the procurement systems it reads, the
 * roles, and "password" itself, in English, Thai and common transliterations. A password
 * made only of these (with any digits or symbols around them, e.g. "TorChecker2026!") is
 * refused, as is one containing the user's own e-mail name. See utils/passwordPolicy.
 */
export const CONTEXT_WORDS: readonly string[] = [
  // the product
  "tor", "torchecker", "checker", "aggregator", "fairness",
  // where and whose TORs
  "bangkok", "bkk", "krungthep", "bma", "kasetsart", "ku",
  "กรุงเทพ", "กรุงเทพมหานคร", "กทม",
  // the procurement systems and vocabulary
  "egp", "gprocurement", "procurement", "process", "bidding", "ebidding",
  "จัดซื้อจัดจ้าง", "จัดซื้อ", "ประกวดราคา",
  // roles and generic account words
  "vendor", "admin", "administrator", "user", "login", "welcome", "secret",
  "password", "pass", "รหัสผ่าน", "รหัส",
];

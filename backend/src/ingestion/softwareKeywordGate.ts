/** Broad first-pass filter. A miss means "do not spend a Gemini call"; a hit means "let Gemini decide". */
export const SOFTWARE_KEYWORD_PATTERN =
  /ซอฟต์แวร์|software|ระบบสารสนเทศ|สารสนเทศ|แอปพลิเคชัน|application|โปรแกรม|program|คอมพิวเตอร์|computer|เว็บ|website|web\b|ดิจิทัล|digital|ฐานข้อมูล|database|คลาวด์|cloud|\bAPI\b|\bIT\b|เทคโนโลยีสารสนเทศ|\bAI\b|ปัญญาประดิษฐ์|CCTV|กล้องโทรทัศน์วงจรปิด|กล้องวงจรปิด|ระบบบริหารจัดการ|ระบบงาน|สแกน|e-?service|อิเล็กทรอนิกส์/i;

export function looksSoftwareRelated(text: string): boolean {
  return SOFTWARE_KEYWORD_PATTERN.test(text ?? "");
}

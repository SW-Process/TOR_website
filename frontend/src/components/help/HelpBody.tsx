import Link from "next/link";
import { Fragment } from "react";

/**
 * Renders help-center text (announcement bodies, FAQ answers) from a small, safe
 * markup — never as HTML, so admin-written text can't inject markup or scripts:
 *
 *   blank line   → new paragraph          "## Title"  → subheading
 *   "- item"     → bullet list             "1. step"   → numbered list
 *   **bold**     → bold                    [label](/path) or [label](https://…) → link
 *
 * Links must be a site path ("/…", not "//…") or https; anything else renders as
 * plain text.
 */

type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "h"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] };

const BULLET = /^\s*[-•]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;

function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const last = blocks[blocks.length - 1];
    if (!line.trim()) {
      blocks.push({ kind: "p", lines: [] }); // paragraph break; empty ones are dropped below
    } else if (line.startsWith("## ")) {
      blocks.push({ kind: "h", text: line.slice(3).trim() });
    } else if (BULLET.test(line)) {
      const item = line.replace(BULLET, "");
      if (last?.kind === "ul") last.items.push(item);
      else blocks.push({ kind: "ul", items: [item] });
    } else if (NUMBERED.test(line)) {
      const item = line.replace(NUMBERED, "");
      if (last?.kind === "ol") last.items.push(item);
      else blocks.push({ kind: "ol", items: [item] });
    } else if (last?.kind === "p") {
      last.lines.push(line.trim());
    } else {
      blocks.push({ kind: "p", lines: [line.trim()] });
    }
  }
  return blocks.filter((b) => b.kind !== "p" || b.lines.length > 0);
}

const INLINE = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g;

function safeHref(href: string): { href: string; external: boolean } | null {
  if (href.startsWith("/") && !href.startsWith("//")) return { href, external: false };
  if (/^https:\/\//i.test(href)) return { href, external: true };
  return null;
}

function Inline({ text }: { text: string }) {
  const parts = text.split(INLINE);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
          return (
            <strong key={i} className="font-semibold text-[var(--color-text)]">
              {part.slice(2, -2)}
            </strong>
          );
        }
        const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
        if (link) {
          const target = safeHref(link[2]!);
          if (!target) return <Fragment key={i}>{link[1]}</Fragment>;
          const cls = "font-semibold text-[var(--color-rose-dark)] underline-offset-2 hover:underline";
          return target.external ? (
            <a key={i} href={target.href} target="_blank" rel="noopener noreferrer" className={cls}>
              {link[1]}
            </a>
          ) : (
            <Link key={i} href={target.href} className={cls}>
              {link[1]}
            </Link>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

export default function HelpBody({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`flex flex-col gap-4 text-[15px] leading-[1.8] text-[var(--color-ink-soft)] ${className}`}>
      {parseBlocks(text).map((block, i) => {
        switch (block.kind) {
          case "h":
            return (
              <h3 key={i} className="mt-2 text-base font-bold text-[var(--color-text)]">
                <Inline text={block.text} />
              </h3>
            );
          case "ul":
            return (
              <ul key={i} className="flex flex-col gap-1.5 pl-5 [list-style:disc] marker:text-[var(--color-rose)]">
                {block.items.map((item, j) => (
                  <li key={j}>
                    <Inline text={item} />
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="flex flex-col gap-1.5 pl-5 [list-style:decimal] marker:font-semibold marker:text-[var(--color-rose-dark)]">
                {block.items.map((item, j) => (
                  <li key={j}>
                    <Inline text={item} />
                  </li>
                ))}
              </ol>
            );
          default:
            return (
              <p key={i}>
                {block.lines.map((line, j) => (
                  <Fragment key={j}>
                    {j > 0 && <br />}
                    <Inline text={line} />
                  </Fragment>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}

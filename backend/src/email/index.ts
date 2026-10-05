import type { EmailSender } from "./email.types";
import { LogEmailSender } from "./logEmailSender";
import { sendGridFromEnv } from "./sendgridEmailSender";

export type { EmailMessage, EmailSender } from "./email.types";

let instance: EmailSender | null = null;

function build(): EmailSender {
  const driver = process.env.EMAIL_DRIVER ?? "log";
  if (driver === "log") return new LogEmailSender();
  if (driver === "sendgrid") return sendGridFromEnv();
  throw new Error(`unknown email driver: ${driver}`);
}

/** Process-wide email sender, chosen by EMAIL_DRIVER (default "log"). */
export function getEmailSender(): EmailSender {
  if (!instance) instance = build();
  return instance;
}

/** Test hook: pass a fake to override, or null to force a rebuild next call. */
export function setEmailSenderForTest(s: EmailSender | null): void {
  instance = s;
}

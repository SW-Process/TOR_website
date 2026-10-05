import sgMail from "@sendgrid/mail";
import type { EmailMessage, EmailSender } from "./email.types";

/** The part of @sendgrid/mail this driver uses; tests pass a fake in its place. */
export interface SendGridClient {
  send(message: { to: string; from: string; subject: string; text: string; html?: string }): Promise<unknown>;
}

/**
 * Production driver: sends through SendGrid's v3 API. SendGrid rejects the promise on a failed
 * send (bad key, unverified sender, rate limit), so callers see the error and can log it.
 */
export class SendGridEmailSender implements EmailSender {
  constructor(
    private readonly from: string,
    private readonly client: SendGridClient = sgMail
  ) {}

  async send(message: EmailMessage): Promise<void> {
    await this.client.send({
      to: message.to,
      from: this.from,
      subject: message.subject,
      text: message.text,
      ...(message.html !== undefined ? { html: message.html } : {}),
    });
  }
}

/** Build from the environment. Fails fast on missing config rather than on the first alert. */
export function sendGridFromEnv(): SendGridEmailSender {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey) throw new Error("SENDGRID_API_KEY is required when EMAIL_DRIVER=sendgrid");
  if (!from) throw new Error("EMAIL_FROM is required when EMAIL_DRIVER=sendgrid");
  sgMail.setApiKey(apiKey);
  return new SendGridEmailSender(from);
}

import type { EmailMessage, EmailSender } from "./email.types";

/**
 * Development driver: prints the message instead of sending it, so alert and
 * reset flows can run locally without a mail provider. Logs the subject and
 * recipient only, never the body.
 */
export class LogEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<void> {
    console.info(`[email:log] to=${message.to} subject=${JSON.stringify(message.subject)}`);
  }
}

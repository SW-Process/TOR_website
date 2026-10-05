export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Sends one email. Implementations must reject on failure so callers can log it. */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

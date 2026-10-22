import type { UserRole } from "../models/User";

/** Shape attached to `req.user` by the auth middleware. */
export interface AuthUser {
  id: string;
  role: UserRole;
  /** The sessions row behind this request's cookie. */
  sessionId: string;
  /** The second factor was checked when this session started. */
  mfa: boolean;
  /** When this session signed in. */
  signedInAt: Date;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      /** Correlates this request's log entries (middleware/requestId). */
      requestId?: string;
    }
  }
}

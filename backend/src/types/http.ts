import type { UserRole } from "../models/User";

/** Shape attached to `req.user` by the auth middleware. */
export interface AuthUser {
  id: string;
  role: UserRole;
  /** The sessions row behind this request's cookie; absent for a not-yet-upgraded legacy token. */
  sessionId?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

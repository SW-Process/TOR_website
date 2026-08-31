import type { Request, Response } from "express";
import { User } from "../models";
import type { UserDocument } from "../models/User";
import { signToken, cookieOptions, COOKIE_NAME } from "../utils/token";
import { httpError } from "../utils/httpError";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

interface Credentials {
  email: string;
  password: string;
}

function validateCredentials(body: unknown): Credentials {
  const { email, password } = (body ?? {}) as Partial<Credentials>;
  if (typeof email !== "string" || !EMAIL_RE.test(email)) {
    throw httpError(400, "A valid email is required");
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    throw httpError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  return { email, password };
}

function sendSession(res: Response, user: UserDocument, status: number): void {
  const token = signToken(user);
  res.cookie(COOKIE_NAME, token, cookieOptions());
  res.status(status).json({ user });
}

/** POST /api/auth/register — create a vendor account and start a session. */
export async function register(req: Request, res: Response): Promise<void> {
  const { email, password } = validateCredentials(req.body);

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) throw httpError(409, "Email is already registered");

  const user = new User({ email, role: "vendor" });
  user.set("password", password);
  await user.save();

  sendSession(res, user, 201);
}

/** POST /api/auth/login — verify credentials and start a session. */
export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = validateCredentials(req.body);

  const user = await User.findOne({ email: email.toLowerCase() }).select("+passwordHash");
  if (!user || !(await user.comparePassword(password))) {
    throw httpError(401, "Invalid email or password");
  }

  sendSession(res, user, 200);
}

/** POST /api/auth/logout — clear the session cookie. */
export async function logout(_req: Request, res: Response): Promise<void> {
  res.clearCookie(COOKIE_NAME, cookieOptions());
  res.status(200).json({ message: "Logged out" });
}

/** GET /api/auth/me — return the authenticated user. */
export async function me(req: Request, res: Response): Promise<void> {
  const user = await User.findById(req.user!.id);
  if (!user) throw httpError(401, "Account no longer exists");
  res.status(200).json({ user });
}

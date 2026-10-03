/**
 * Admin-facing view of a user account (reporter, chat visitor, resolver):
 * the vendor company name when there is one, else the email's local part.
 */

export type Id = { toString(): string };
export const key = (id: Id | null | undefined) => (id ? id.toString() : "");

export interface UserLite {
  _id: Id;
  email: string;
  role: string;
  avatarKey?: string;
}

export function person(u: UserLite | undefined, companyName?: string) {
  if (!u) return null;
  return {
    id: key(u._id),
    email: u.email,
    displayName: companyName || u.email.split("@")[0],
    companyName: companyName ?? null,
    role: u.role,
    avatarUrl: u.avatarKey ? `/api/auth/avatar/${key(u._id)}` : null,
  };
}

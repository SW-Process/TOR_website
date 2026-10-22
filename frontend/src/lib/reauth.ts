/**
 * "Confirm it's you" before sensitive account changes (ASVS 7.5.1). The backend answers
 * 401 `reauth_required` with the factors it wants; apiFetch hands that to the dialog
 * registered here (components/ReauthDialog), and retries the request once the user has
 * confirmed. With no dialog mounted the 401 is returned as it is.
 */
export type ReauthMethod = "password" | "totp" | "google";
export type ReauthHandler = (methods: ReauthMethod[]) => Promise<boolean>;

let handler: ReauthHandler | null = null;

export function setReauthHandler(next: ReauthHandler | null): void {
  handler = next;
}

export function getReauthHandler(): ReauthHandler | null {
  return handler;
}

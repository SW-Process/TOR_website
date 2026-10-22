// Tests must never reach the real gprocurement service; they inject fake clients instead.
process.env.GPROC_ENABLED = "false";
// Most suites sign admins in with a password only; the MFA suites switch this back on.
process.env.ADMIN_MFA_REQUIRED = "false";
// The breached-password check calls api.pwnedpasswords.com; its own tests fake the call.
process.env.BREACHED_PASSWORD_CHECK = "false";

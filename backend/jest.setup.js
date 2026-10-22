// Tests must never reach the real gprocurement service; they inject fake clients instead.
process.env.GPROC_ENABLED = "false";
// Most suites sign admins in with a password only; the MFA suites switch this back on.
process.env.ADMIN_MFA_REQUIRED = "false";

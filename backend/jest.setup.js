// Tests must never reach the real gprocurement service; they inject fake clients instead.
process.env.GPROC_ENABLED = "false";

import { Router } from "express";
import multer from "multer";
import {
  register,
  login,
  logout,
  forgotPassword,
  resetPassword,
  me,
  updateAccount,
  changePassword,
  changeEmail,
  logoutOthers,
  listSessions,
  revokeSession,
  deleteAccount,
  uploadAvatar,
  streamAvatar,
  googleStart,
  googleCallback,
  googleLinkStart,
  googleUnlink,
  reauthStatus,
  reauthenticate,
} from "../controllers/authController";
import { listMyReports } from "../controllers/errorReportController";
import { enableMfa, regenerateRecoveryCodes, startMfaSetup, turnOffMfa, verifyMfaLogin } from "../controllers/mfaController";
import { requireAuth } from "../middleware/auth";
import {
  forgotPasswordPerAccount,
  forgotPasswordPerIp,
  loginPerAccount,
  loginPerIp,
  mfaVerifyPerAccount,
  mfaVerifyPerIp,
  reauthLimit,
  registerLimit,
  resetPasswordLimit,
} from "../middleware/rateLimits";

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const router = Router();

router.post("/register", registerLimit, register);
router.post("/login", loginPerIp, loginPerAccount, login);
router.post("/logout", logout);
router.post("/mfa/verify", mfaVerifyPerIp, mfaVerifyPerAccount, verifyMfaLogin);
router.post("/mfa/setup", requireAuth, reauthLimit, startMfaSetup);
router.post("/mfa/enable", requireAuth, reauthLimit, enableMfa);
router.post("/mfa/disable", requireAuth, reauthLimit, turnOffMfa);
router.post("/mfa/recovery-codes", requireAuth, reauthLimit, regenerateRecoveryCodes);
router.post("/forgot-password", forgotPasswordPerIp, forgotPasswordPerAccount, forgotPassword);
router.post("/reset-password", resetPasswordLimit, resetPassword);
router.get("/me", requireAuth, me);
router.patch("/me", requireAuth, updateAccount);
router.delete("/me", requireAuth, reauthLimit, deleteAccount);
router.put("/password", requireAuth, reauthLimit, changePassword);
router.put("/email", requireAuth, reauthLimit, changeEmail);
router.get("/reauth", requireAuth, reauthStatus);
router.post("/reauth", requireAuth, reauthLimit, reauthenticate);
router.post("/logout-others", requireAuth, reauthLimit, logoutOthers);
router.get("/sessions", requireAuth, listSessions);
router.delete("/sessions/:id", requireAuth, reauthLimit, revokeSession);
router.get("/reports", requireAuth, listMyReports);

router.post("/avatar", requireAuth, avatarUpload.single("avatar"), uploadAvatar);
router.get("/avatar/:userId", streamAvatar);

router.get("/google", googleStart);
router.get("/google/callback", googleCallback);
router.get("/google/link", requireAuth, googleLinkStart);
router.delete("/google", requireAuth, reauthLimit, googleUnlink);

export default router;

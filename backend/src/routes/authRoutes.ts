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
} from "../controllers/authController";
import { listMyReports } from "../controllers/errorReportController";
import { requireAuth } from "../middleware/auth";

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/me", requireAuth, me);
router.patch("/me", requireAuth, updateAccount);
router.delete("/me", requireAuth, deleteAccount);
router.put("/password", requireAuth, changePassword);
router.put("/email", requireAuth, changeEmail);
router.post("/logout-others", requireAuth, logoutOthers);
router.get("/sessions", requireAuth, listSessions);
router.delete("/sessions/:id", requireAuth, revokeSession);
router.get("/reports", requireAuth, listMyReports);

router.post("/avatar", requireAuth, avatarUpload.single("avatar"), uploadAvatar);
router.get("/avatar/:userId", streamAvatar);

router.get("/google", googleStart);
router.get("/google/callback", googleCallback);
router.get("/google/link", requireAuth, googleLinkStart);
router.delete("/google", requireAuth, googleUnlink);

export default router;

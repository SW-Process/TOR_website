import { Router } from "express";
import multer from "multer";
import {
  register,
  login,
  logout,
  me,
  updateAccount,
  changePassword,
  changeEmail,
  deleteAccount,
  uploadAvatar,
  streamAvatar,
  googleStart,
  googleCallback,
} from "../controllers/authController";
import { requireAuth } from "../middleware/auth";

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);
router.get("/me", requireAuth, me);
router.patch("/me", requireAuth, updateAccount);
router.delete("/me", requireAuth, deleteAccount);
router.put("/password", requireAuth, changePassword);
router.put("/email", requireAuth, changeEmail);

router.post("/avatar", requireAuth, avatarUpload.single("avatar"), uploadAvatar);
router.get("/avatar/:userId", streamAvatar);

router.get("/google", googleStart);
router.get("/google/callback", googleCallback);

export default router;

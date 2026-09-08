import { Router } from "express";
import {
  register,
  login,
  logout,
  me,
  googleStart,
  googleCallback,
} from "../controllers/authController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);
router.get("/me", requireAuth, me);

router.get("/google", googleStart);
router.get("/google/callback", googleCallback);

export default router;

import { Router } from "express";
import { getMyConversation, markMyConversationRead, sendMyMessage } from "../controllers/chatController";
import { requireAuth } from "../middleware/auth";
import { chatMessageLimit } from "../middleware/rateLimits";

const router = Router();

// Login required — one thread per account.
router.use(requireAuth);

router.get("/conversation", getMyConversation);
router.post("/messages", chatMessageLimit, sendMyMessage);
router.post("/read", markMyConversationRead);

export default router;

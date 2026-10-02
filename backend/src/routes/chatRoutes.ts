import { Router } from "express";
import { getMyConversation, markMyConversationRead, sendMyMessage } from "../controllers/chatController";
import { optionalAuth } from "../middleware/auth";

const router = Router();

// Usable logged in (thread keyed by account) or anonymous (X-Chat-Token).
router.use(optionalAuth);

router.get("/conversation", getMyConversation);
router.post("/messages", sendMyMessage);
router.post("/read", markMyConversationRead);

export default router;

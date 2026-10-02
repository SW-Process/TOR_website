import { Router } from "express";
import { listAdminTors, updateAdminTor, hideAdminTor } from "../controllers/adminTorController";
import { getAdminStats } from "../controllers/adminStatsController";
import { listReports, updateReport } from "../controllers/adminReportController";
import { listLogs } from "../controllers/adminLogController";
import { listChats, getChatMessages, replyToChat, markChatRead, updateChat } from "../controllers/adminChatController";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.use(requireAuth, requireRole("admin"));

router.get("/stats", getAdminStats);
router.get("/tors", listAdminTors);
router.patch("/tors/:id", updateAdminTor);
router.delete("/tors/:id", hideAdminTor);
router.get("/reports", listReports);
router.patch("/reports/:id", updateReport);
router.get("/logs", listLogs);
router.get("/chats", listChats);
router.patch("/chats/:id", updateChat);
router.get("/chats/:id/messages", getChatMessages);
router.post("/chats/:id/messages", replyToChat);
router.post("/chats/:id/read", markChatRead);

export default router;

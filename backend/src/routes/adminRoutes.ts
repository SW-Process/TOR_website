import { Router } from "express";
import { listAdminTors, updateAdminTor, hideAdminTor } from "../controllers/adminTorController";
import { getAdminStats } from "../controllers/adminStatsController";
import { listReports, updateReport } from "../controllers/adminReportController";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.use(requireAuth, requireRole("admin"));

router.get("/stats", getAdminStats);
router.get("/tors", listAdminTors);
router.patch("/tors/:id", updateAdminTor);
router.delete("/tors/:id", hideAdminTor);
router.get("/reports", listReports);
router.patch("/reports/:id", updateReport);

export default router;

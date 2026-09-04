import { Router } from "express";
import { createRun, listRuns, getRun } from "../controllers/ingestionController";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.use(requireAuth, requireRole("admin"));

router.post("/runs", createRun);
router.get("/runs", listRuns);
router.get("/runs/:id", getRun);

export default router;

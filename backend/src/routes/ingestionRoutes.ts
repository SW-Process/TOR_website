import { Router } from "express";
import {
  createRun,
  listRuns,
  getRun,
  createEnrichmentRun,
  getEnrichmentPending,
} from "../controllers/ingestionController";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.use(requireAuth, requireRole("admin"));

router.post("/runs", createRun);
router.get("/runs", listRuns);
router.get("/runs/:id", getRun);
router.post("/enrichment/runs", createEnrichmentRun);
router.get("/enrichment/pending", getEnrichmentPending);

export default router;

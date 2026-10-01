import { Router } from "express";
import { streamTorDocument } from "../controllers/torDocumentController";
import { listTors, listAgencies, getTor, priceStats } from "../controllers/torController";
import { reportTorError } from "../controllers/errorReportController";
import { optionalAuth } from "../middleware/auth";

const router = Router();

// /price-stats and /agencies are declared before /:id so they are not captured as an id.
router.get("/", listTors);
router.get("/price-stats", priceStats);
router.get("/agencies", listAgencies);
router.get("/:id", getTor);
router.get("/:id/document", streamTorDocument);
router.post("/:id/report", optionalAuth, reportTorError);

export default router;

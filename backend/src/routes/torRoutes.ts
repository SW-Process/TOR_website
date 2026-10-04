import { Router } from "express";
import { streamTorDocument } from "../controllers/torDocumentController";
import { listTors, listAgencies, listTechnologies, getTor, priceStats, recordView } from "../controllers/torController";
import { reportTorError } from "../controllers/errorReportController";
import { optionalAuth } from "../middleware/auth";

const router = Router();

// /price-stats, /agencies and /technologies are declared before /:id so they are not captured as an id.
// optionalAuth: a signed-in vendor's hidden TORs are left out of their search results.
router.get("/", optionalAuth, listTors);
router.get("/price-stats", priceStats);
router.get("/agencies", listAgencies);
router.get("/technologies", listTechnologies);
router.get("/:id", getTor);
router.get("/:id/document", streamTorDocument);
router.post("/:id/report", optionalAuth, reportTorError);
router.post("/:id/view", recordView);

export default router;

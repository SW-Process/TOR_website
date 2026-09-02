import { Router } from "express";
import { streamTorDocument } from "../controllers/torDocumentController";
import { listTors, getTor, priceStats } from "../controllers/torController";

const router = Router();

// /price-stats is declared before /:id so it is not captured as an id.
router.get("/", listTors);
router.get("/price-stats", priceStats);
router.get("/:id", getTor);
router.get("/:id/document", streamTorDocument);

export default router;

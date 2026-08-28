import { Router } from "express";
import { streamTorDocument } from "../controllers/torDocumentController";

const router = Router();

// TOR search / detail endpoints land here later; for now just the document stream.
router.get("/:id/document", streamTorDocument);

export default router;

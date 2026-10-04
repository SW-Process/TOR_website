import { Router } from "express";
import { getAnnouncement, getFaq, getHelpHome, listAnnouncements, listFaqs } from "../controllers/helpController";

/** Public help center: published announcements and FAQs only. */
const router = Router();

router.get("/", getHelpHome);
router.get("/announcements", listAnnouncements);
router.get("/announcements/:id", getAnnouncement);
router.get("/faqs", listFaqs);
router.get("/faqs/:id", getFaq);

export default router;

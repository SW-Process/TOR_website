import { Router } from "express";
import {
  getProfile,
  updateProfile,
  listSavedSearches,
  addSavedSearch,
  updateSavedSearch,
  deleteSavedSearch,
} from "../controllers/vendorProfileController";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.use(requireAuth, requireRole("vendor"));

router.get("/profile", getProfile);
router.put("/profile", updateProfile);

router.get("/profile/saved-searches", listSavedSearches);
router.post("/profile/saved-searches", addSavedSearch);
router.patch("/profile/saved-searches/:searchId", updateSavedSearch);
router.delete("/profile/saved-searches/:searchId", deleteSavedSearch);

export default router;

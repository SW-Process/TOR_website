import { Router } from "express";
import {
  getProfile,
  updateProfile,
  listSavedSearches,
  addSavedSearch,
  updateSavedSearch,
  deleteSavedSearch,
} from "../controllers/vendorProfileController";
import { listMatches } from "../controllers/matchController";
import {
  listBookmarks,
  putBookmark,
  updateBookmark,
  deleteBookmark,
} from "../controllers/bookmarkController";
import { listHiddenTors, hideTor, unhideTor } from "../controllers/hiddenTorController";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

// Profile and matching are keyed by the caller's own user id, so admins may use them too.
// Everything else (saved searches, bookmarks, hidden TORs) stays vendor-only.
const vendorOrAdmin = requireRole("vendor", "admin");
const vendorOnly = requireRole("vendor");

router.get("/profile", vendorOrAdmin, getProfile);
router.put("/profile", vendorOrAdmin, updateProfile);

router.get("/profile/saved-searches", vendorOnly, listSavedSearches);
router.post("/profile/saved-searches", vendorOnly, addSavedSearch);
router.patch("/profile/saved-searches/:searchId", vendorOnly, updateSavedSearch);
router.delete("/profile/saved-searches/:searchId", vendorOnly, deleteSavedSearch);

router.get("/matches", vendorOrAdmin, listMatches);

router.get("/bookmarks", vendorOnly, listBookmarks);
router.put("/bookmarks/:torId", vendorOnly, putBookmark);
router.patch("/bookmarks/:torId", vendorOnly, updateBookmark);
router.delete("/bookmarks/:torId", vendorOnly, deleteBookmark);

router.get("/hidden-tors", vendorOnly, listHiddenTors);
router.put("/hidden-tors/:torId", vendorOnly, hideTor);
router.delete("/hidden-tors/:torId", vendorOnly, unhideTor);

export default router;

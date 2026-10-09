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
import { listNotifications, markNotificationRead } from "../controllers/notificationController";
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

router.get("/bookmarks", vendorOrAdmin, listBookmarks);
router.put("/bookmarks/:torId", vendorOrAdmin, putBookmark);
router.patch("/bookmarks/:torId", vendorOrAdmin, updateBookmark);
router.delete("/bookmarks/:torId", vendorOrAdmin, deleteBookmark);

router.get("/hidden-tors", vendorOnly, listHiddenTors);
router.put("/hidden-tors/:torId", vendorOnly, hideTor);
router.delete("/hidden-tors/:torId", vendorOnly, unhideTor);

router.get("/notifications", vendorOrAdmin, listNotifications);
router.patch("/notifications/:id/read", vendorOrAdmin, markNotificationRead);

export default router;

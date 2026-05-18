const express = require("express");
const { isLoggedIn } = require("../middlewares");
const {
  createActivityType,
  getActivityTypes,
  updateActivityType,
  updateActivityTypeOrder,
  createActivityItem,
  getActivityItems,
  updateActivityItem,
  updateActivityItemOrder,
  deleteActivityItem,
} = require("../controllers/activity");

const router = express.Router();

router.post("/activity-types", isLoggedIn, createActivityType);
router.get("/activity-types", isLoggedIn, getActivityTypes);
router.patch("/activity-types/order", isLoggedIn, updateActivityTypeOrder);
router.patch("/activity-types/:id", isLoggedIn, updateActivityType);

router.post("/activities", isLoggedIn, createActivityItem);
router.get("/activities", isLoggedIn, getActivityItems);
router.patch("/activities/order", isLoggedIn, updateActivityItemOrder);
router.patch("/activities/:id", isLoggedIn, updateActivityItem);
router.delete("/activities/:id", isLoggedIn, deleteActivityItem);

module.exports = router;

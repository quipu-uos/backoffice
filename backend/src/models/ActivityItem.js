const mongoose = require("mongoose");

const ActivityItemSchema = new mongoose.Schema(
  {
    typeKey: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    order: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    isVisible: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      default: {},
    },
  },
  {
    collection: "activity_items",
    timestamps: true,
  }
);

ActivityItemSchema.index({ typeKey: 1, order: 1 });
ActivityItemSchema.index({ typeKey: 1, isVisible: 1, order: 1 });

module.exports =
  mongoose.models.ActivityItem || mongoose.model("ActivityItem", ActivityItemSchema);

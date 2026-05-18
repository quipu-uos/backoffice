const mongoose = require("mongoose");

const FieldTypeValues = [
  "shortText",
  "longText",
  "date",
  "dateRange",
  "image",
  "imageList",
  "url",
  "icon",
];

const ActivityFieldSchema = new mongoose.Schema(
  {
    fieldId: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    inputType: {
      type: String,
      required: true,
      enum: FieldTypeValues,
    },
    required: {
      type: Boolean,
      required: true,
      default: false,
    },
    order: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    fileConfig: {
      maxFiles: {
        type: Number,
        min: 1,
      },
      maxSizeMB: {
        type: Number,
        min: 0,
      },
    },
  },
  { _id: false }
);

const ActivityTypeSchema = new mongoose.Schema(
  {
    typeId: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      immutable: true,
      index: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    order: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      index: true,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
    fields: {
      type: [ActivityFieldSchema],
      required: true,
      default: [],
    },
  },
  {
    collection: "activity_types",
    timestamps: true,
  }
);

ActivityTypeSchema.index({ isActive: 1, order: 1 });

module.exports =
  mongoose.models.ActivityType || mongoose.model("ActivityType", ActivityTypeSchema);
module.exports.FieldTypeValues = FieldTypeValues;

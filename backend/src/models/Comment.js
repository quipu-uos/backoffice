const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      required: true,
      maxlength: 200,
    },
    author: {
      type: String,
      required: true,
      maxlength: 20,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true }
);

// 공개 API: approved 필터 + 최신순 정렬
commentSchema.index({ status: 1, createdAt: -1, _id: -1 });
// 관리자 API: status 선택 필터 + 최신순 정렬
commentSchema.index({ createdAt: -1, _id: -1 });

module.exports = mongoose.model("Comment", commentSchema);

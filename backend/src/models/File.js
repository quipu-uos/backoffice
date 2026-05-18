const mongoose = require("mongoose");

const fileSchema = new mongoose.Schema(
  {
    //file_id: { type: Number, required: true, unique: true, index: true },
    file_name: { type: String, required: true, trim: true },
    semina_id: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  },
  {
    versionKey: false,
    timestamps: true,
    collection: "files",
  }
);

module.exports = mongoose.model("File", fileSchema);

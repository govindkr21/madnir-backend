const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");

const RxItemSchema = new mongoose.Schema(
  {
    drug: { type: String, required: true, trim: true },
    dose: { type: String, default: "" },
    freq: { type: String, default: "" },
    days: { type: String, default: "" },
    when: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
  { _id: false }
);

const TemplateSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor", default: null, index: true },
    name: { type: String, required: true, trim: true },
    diagnosis: { type: String, default: "" },
    symptoms: { type: [String], default: [] },
    medicines: { type: [RxItemSchema], default: [] },
    advice: { type: String, default: "" },
    notes: { type: String, default: "" },
    shared: { type: Boolean, default: false },
    usageCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

TemplateSchema.plugin(mongoosePaginate);

module.exports = mongoose.model("Template", TemplateSchema);

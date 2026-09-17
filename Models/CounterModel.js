const mongoose = require("mongoose");

const CounterSchema = new mongoose.Schema(
  {
    scope: { type: String, required: true },
    name: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { timestamps: true }
);

CounterSchema.index({ scope: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("Counter", CounterSchema);

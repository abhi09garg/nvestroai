// models/Recommendation.js
import mongoose from "mongoose";

const recommendationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    profile: {
      age: Number,
      income: Number,
      riskTolerance: String,
      investmentHorizon: String,
      preferences: [String],
    },
    baseAllocation: {},
    finalAllocation: {},
    sectorScores: {},
    sectorDetails: {},
    overallConfidence: Number,
    advice: String,
    explanation: String,
    note: { type: String, default: "" }, // ✅ allow users to attach/edit a note
  },
  { timestamps: true }
);

const Recommendation = mongoose.model("Recommendation", recommendationSchema);

export default Recommendation;
